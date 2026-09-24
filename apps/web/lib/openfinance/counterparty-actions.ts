'use server'

import { z } from 'zod'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb, orgs, counterparties, transactions } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'
import { assertAccountOwnership } from '@/lib/finance/account-actions'
import { requireIdentity } from '@/lib/auth/session'
import { revalidateSnapshotData, revalidateTransactionData } from '@/lib/finance/revalidate'
import { accountsTag, invalidateTag, reviewGateTag } from '@/lib/cache-tags'
import { condicaoForaDeParDeTransferenciaPendente, criarPropostasDeConciliacao } from '@/lib/finance/forecast-match-db'
import { aplicarDecisaoAosPendentes, contaQueARegraGrava, ehRegraDoTitular, exceptionSchema } from './aplicar-regra'
export type { ConfirmCounterpartyException } from './aplicar-regra'

/**
 * O usuário confirma a natureza e a categoria de uma contraparte, e a
 * confirmação vale para trás E para a frente: as transações pendentes hoje
 * reclassificam agora; a próxima sincronização casa pela mesma linha em
 * `counterparties` (ver `resolve-counterparty.ts`).
 *
 * Substitui `nature-actions.ts::createNatureRule`. A diferença estrutural: lá
 * o UPDATE de transações precisava de `transactionIds` explícitos vindos do
 * cliente, porque a chave era texto reconstruído. Aqui é `counterparty_id`
 * gravado desde a ingestão — chave estrangeira, não há texto para divergir.
 *
 * `exceptions` cobre o lançamento que foge do padrão do grupo (ex.: os dois
 * Pix de valor atípico no meio de 32 recorrentes) sem virar regra: só os
 * lançamentos listados saem com a natureza/categoria da exceção, e a
 * contraparte grava a natureza/categoria do grupo do mesmo jeito — a próxima
 * sincronização aplica o padrão, não a exceção pontual.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */

// Transferência aceita `transferAccountId` nulo aqui: pode ser CPF próprio
// (regra não grava conta nenhuma) — quem decide se a conta é obrigatória é
// `contaQueARegraGrava`, dentro da transação, depois de saber se é CPF
// próprio. Receita/despesa continuam exigindo categoria e nenhuma conta.
const inputSchema = z
  .object({
    counterpartyId: z.string().uuid(),
    nature: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.string().uuid().nullable(),
    transferAccountId: z.string().uuid().nullable(),
    exceptions: z.array(exceptionSchema).default([]),
  })
  .refine((v) => (v.nature === 'transfer' ? v.categoryId === null : v.categoryId !== null && v.transferAccountId === null), {
    message: 'Transferência exige a outra conta, sem categoria. Receita e despesa exigem categoria, sem conta.',
  })

// `z.input`, não `z.infer`: `exceptions` tem `.default([])`, então quem chama
// pode omitir — só depois do `.parse()` é que o array garantidamente existe.
export type ConfirmCounterpartyInput = z.input<typeof inputSchema>

// Mesmo padrão de `resolve-counterparty.ts`/`sync.ts`: `Db` é o tipo cheio
// de `getDb()`, e o `tx` de dentro de `db.transaction(async (tx) => ...)` é
// estruturalmente compatível — sem precisar de um tipo próprio pra ele.
type Db = ReturnType<typeof getDb>

export async function confirmCounterparty(raw: ConfirmCounterpartyInput): Promise<{ reclassified: number }> {
  const input = inputSchema.parse(raw)
  const orgId = await getOrgId()
  const db = getDb()

  const { userId } = await requireIdentity()

  const contasParaConciliar = new Set<string>()

  const reclassified = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: counterparties.id, keyType: counterparties.keyType, keyValue: counterparties.keyValue })
      .from(counterparties)
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))
      .limit(1)

    if (!row) throw new Error('Contraparte não encontrada.')

    const cpfProprio = await ehRegraDoTitular(tx as unknown as Db, orgId, row)
    const contaDaRegra = contaQueARegraGrava({ nature: input.nature, transferAccountId: input.transferAccountId, cpfProprio })

    if (input.nature === 'transfer' && input.transferAccountId) {
      // Valida a posse da conta de destino incondicionalmente, ANTES de
      // gravar `counterparties.transferAccountId` — não só dentro de
      // `applyTransferSingle`. Sem isso, quando a fila de pendentes desta
      // contraparte já está vazia (ou toda coberta por exceção), o loop de
      // `applyTransferBatch` nunca roda, `applyTransferSingle` nunca roda, e
      // um `transferAccountId` de outra org commitaria em `counterparties`
      // sem nunca ter sido checado — campo que uma sincronização futura lê
      // pra aplicar a regra automaticamente (ver task-3-report.md, achado da
      // revisão: rodada 2). A checagem dentro de `applyTransferSingle`
      // continua ali, redundante mas inofensiva, cobrindo o batch/exceções.
      await assertAccountOwnership(tx as unknown as Db, input.transferAccountId, orgId)
    }

    await tx
      .update(counterparties)
      .set({
        nature: input.nature,
        categoryId: input.categoryId,
        transferAccountId: contaDaRegra,
        confirmedAt: new Date(),
        confirmedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(counterparties.id, input.counterpartyId), eq(counterparties.orgId, orgId)))

    // Mesmo cast de `assertAccountOwnership(tx as unknown as Db, ...)` em
    // `lib/finance/account-actions.ts`: o `tx` de dentro do callback não é
    // diretamente atribuível ao tipo cheio de `getDb()`.
    const reclassifiedCount = await aplicarDecisaoAosPendentes(
      tx as unknown as Db,
      orgId,
      { counterpartyId: input.counterpartyId, nature: input.nature, categoryId: input.categoryId, transferAccountId: input.transferAccountId, exceptions: input.exceptions },
      contasParaConciliar,
    )

    // Se esta foi a última pendência resolvível da org, destrava o portão
    // para sempre. Movido de getReviewGateStatus (achado da revisão final):
    // gravar como efeito de leitura destravava orgs sem fila nenhuma antes
    // do bootstrap sequer existir — agora só grava quando uma confirmação
    // de verdade zera a fila.
    const [stillPending] = await tx
      .select({ one: sql`1` })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.reviewState, 'pending'),
          isNotNull(transactions.counterpartyId),
          // Ponta com par de transferência pendente decide-se em Confirmar previsões.
          condicaoForaDeParDeTransferenciaPendente(),
        ),
      )
      .limit(1)

    if (!stillPending) {
      await tx
        .update(orgs)
        .set({ reviewGateClearedAt: sql`coalesce(${orgs.reviewGateClearedAt}, now())` })
        .where(eq(orgs.id, orgId))
    }

    return reclassifiedCount
  })

  invalidateTag(accountsTag(orgId))
  revalidateSnapshotData(orgId)
  // O layout guarda em cache se o portão já destravou; esta action é o único
  // lugar que o destrava.
  invalidateTag(reviewGateTag(orgId))

  // A ponta real pode já estar na outra conta: propõe o par agora, sem
  // esperar o próximo sync dela. Falha aqui não desfaz a confirmação — a
  // proposta nasce de novo na próxima passada daquela conta.
  for (const conta of contasParaConciliar) {
    try {
      await criarPropostasDeConciliacao(db, orgId, conta)
    } catch (error) {
      console.error('[confirmCounterparty] falha ao propor conciliacao da perna prevista:', error)
    }
  }

  // Depois das propostas, não antes: a lista de lançamentos e as filas leem
  // as propostas; invalidar antes serviria a tela sem o par recém-proposto.
  revalidateTransactionData(orgId)

  return { reclassified }
}
