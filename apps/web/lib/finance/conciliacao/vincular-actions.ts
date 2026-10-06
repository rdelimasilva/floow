'use server'

import { z } from 'zod'
import { and, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import { getDb, transactions, forecastMatchProposals, accounts, categories } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag } from '@/lib/cache-tags'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { conciliarContas } from '@/lib/finance/conciliacao/conciliar-conta'
import { aplicarDecisaoAosPendentes } from '@/lib/openfinance/aplicar-regra'
import { capturarPendentes, registrarDecisoes } from '@/lib/finance/conciliacao/validacoes'
import { requireIdentity } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { mensagemDeErro } from '@/lib/mensagem-de-erro'
import { temPalavraEmComum } from '@floow/core-finance/src/forecast-match'
import type { Candidata } from './candidatos'
import { vincularNoBanco, type ResultadoDoVinculo } from './vincular-db'
import { interpretarTermo } from './termo-de-busca'

type Db = ReturnType<typeof getDb>

/**
 * "Vincular" do card (spec §5.1). `efetivada: false` = o par deixou de valer;
 * a tela tira a candidata e avisa. `classificou` diz se ainda há o que classificar.
 */
export async function vincularPrevisao(realizadoId: string, previsaoId: string): Promise<ResultadoDoVinculo> {
  const orgId = await getOrgId()
  const r = await getDb().transaction((tx) => vincularNoBanco(tx as unknown as Db, orgId, realizadoId, previsaoId))
  if (r.efetivada) revalidateTransactionData(orgId)
  return r
}

/** "Não é nenhum" (spec §5.2): o lançamento não cumpre previsão nenhuma. */
export async function marcarSemVinculo(realizadoId: string): Promise<{ ok: boolean }> {
  const orgId = await getOrgId()
  await getDb().transaction(async (tx) => {
    await tx.update(transactions).set({ vinculoRevisadoEm: new Date() })
      .where(and(eq(transactions.id, realizadoId), eq(transactions.orgId, orgId)))
    await tx.update(forecastMatchProposals).set({ status: 'refused', decidedAt: new Date() })
      .where(and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'), eq(forecastMatchProposals.realizedTransactionId, realizadoId)))
  })
  revalidateTransactionData(orgId)
  return { ok: true }
}

const soEsteSchema = z.object({
  transactionId: z.string().uuid(), counterpartyId: z.string().uuid(),
  nature: z.enum(['income', 'expense', 'transfer']),
  categoryId: z.string().uuid().nullable(), transferAccountId: z.string().uuid().nullable(),
}).refine((v) => (v.nature === 'transfer' ? v.categoryId === null && v.transferAccountId !== null : v.categoryId !== null && v.transferAccountId === null))

/**
 * Classificar com "fazer igual daqui pra frente" desmarcado (spec §5.4): o
 * mesmo caminho de `confirmCounterparty`, restrito a este lançamento e sem
 * gravar a regra na contraparte — o próximo lançamento dela volta para a fila.
 */
export async function classificarSoEste(raw: z.input<typeof soEsteSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = soEsteSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Transferência exige a outra conta; receita e despesa exigem categoria.' }
  const input = parsed.data
  const orgId = await getOrgId()
  const db = getDb()
  const { userId } = await requireIdentity()
  const contasParaConciliar = new Set<string>()

  let aplicados: number
  try {
    aplicados = await db.transaction(async (tx) => {
      if (input.transferAccountId) {
        try {
          await assertAccountOwnership(tx as unknown as Db, input.transferAccountId, orgId)
        } catch {
          // `assertAccountOwnership` lança em inglês com o uuid cru da conta
          // ("Account <id> not found or does not belong to this
          // organization") — mensagem técnica que não pode chegar ao
          // catch genérico abaixo (`mensagemDeErro` a devolveria do jeito
          // que está, por ser uma `Error` com texto). Troca pela mensagem
          // de usuário antes de sair da transação.
          throw new Error('A conta escolhida não pertence a esta organização.')
        }
      }
      const captura = await capturarPendentes(tx as unknown as Db, orgId, input.counterpartyId, [input.transactionId])
      const n = await aplicarDecisaoAosPendentes(
        tx as unknown as Db, orgId,
        { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: input.transferAccountId, exceptions: [] },
        contasParaConciliar, [input.transactionId],
      )
      await registrarDecisoes(tx as unknown as Db, orgId, captura, userId)
      return n
    })
  } catch (error) {
    // `assertAccountOwnership` e `aplicarDecisaoAosPendentes` lançam em vez de
    // devolver erro (mesmo padrão de `confirmCounterparty`, que não é tocado
    // aqui). Sem este catch, a mensagem — ex.: "A conta da transferência não
    // pode ser a mesma conta do lançamento." — some em produção: o Next
    // substitui todo erro lançado no servidor por um texto genérico.
    return { error: mensagemDeErro(error, 'Não foi possível classificar este lançamento.') }
  }
  if (aplicados === 0) return { error: 'Este lançamento já foi classificado. A fila foi atualizada.' }

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  await conciliarContas(db, orgId, contasParaConciliar, '[classificarSoEste]')
  revalidateTransactionData(orgId)
  return { ok: true }
}

/**
 * A coluna `date` chega como Date. Os helpers do Drizzle (`eq`, `gte`) a
 * serializam; parâmetro de `sql` cru, não — o postgres-js lança
 * ERR_INVALID_ARG_TYPE. Em `sql` cru, data vai como 'YYYY-MM-DD'.
 */
const diaIso = (d: Date | string) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)

/**
 * "Procurar previsão" (spec §2.4): todas as contas, por descrição ou valor.
 * Só devolve o que `vincularNoBanco` aceitaria: mesmo sinal do realizado, e
 * perna que aguarda extrato só da conta dele. Não aplica o filtro do palpite
 * (o usuário procura o que quiser); só marca o nome parecido.
 */
export async function procurarPrevisoes(realizadoId: string, termo: string): Promise<Candidata[]> {
  const orgId = await getOrgId()
  const t = termo.trim()
  if (t.length < 2) return []
  const { centavos, texto } = interpretarTermo(t)
  return withUserDb(async (db) => {
    const [real] = await db.select({
      accountId: transactions.accountId, date: transactions.date, amountCents: transactions.amountCents, description: transactions.description,
    })
      .from(transactions).where(and(eq(transactions.id, realizadoId), eq(transactions.orgId, orgId))).limit(1)
    if (!real) return []
    const porValor = centavos !== null ? sql`abs(${transactions.amountCents}) = ${centavos}` : undefined
    const porTexto = texto !== null ? ilike(transactions.description, `%${texto}%`) : undefined
    const filtroTermo = porValor && porTexto ? or(porValor, porTexto) : (porValor ?? porTexto)
    const rows = await db.select({
      id: transactions.id, accountId: transactions.accountId, contaNome: accounts.name, date: transactions.date,
      amountCents: transactions.amountCents, description: transactions.description, categoriaNome: categories.name,
    })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(
        eq(transactions.orgId, orgId), eq(transactions.balanceApplied, false), isNull(transactions.matchedTransactionId),
        eq(transactions.isIgnored, false), ne(transactions.origem, 'extrato'), filtroTermo,
        sql`sign(${transactions.amountCents}) = ${Math.sign(real.amountCents)}`,
        or(eq(transactions.aguardaExtrato, false), eq(transactions.accountId, real.accountId)),
      ))
      .orderBy(sql`abs(${transactions.date} - ${diaIso(real.date)}::date)`)
      .limit(10)
    const dia = (d: Date | string) => Date.parse(diaIso(d))
    return rows.map((p) => ({
      ...p, date: p.date instanceof Date ? p.date.toISOString() : String(p.date),
      diasDeDiferenca: Math.round(Math.abs(dia(p.date) - dia(real.date)) / 86_400_000),
      diferencaCents: Math.abs(p.amountCents - real.amountCents),
      outraConta: p.accountId !== real.accountId, propostaId: null,
      nomeParecido: temPalavraEmComum(real.description, p.description),
    }))
  })
}
