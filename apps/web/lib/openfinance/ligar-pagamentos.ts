import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import type { Db } from './persist-page'
import type { PagamentoDoBanco } from './faturas-do-banco'
import { buildTransferLegRow } from './transfer-leg'

/**
 * O pagamento da fatura entra no cartão.
 *
 * A saída sai da conta corrente como transferência ("Débito automático ITAU
 * VISA PAO DE AC", "FATURA PAGA PERSONNALITE"), mas sem o outro lado: a
 * transferência não diz para qual conta foi, e o extrato do cartão quase
 * nunca traz o pagamento (o Visa nunca; o Master Black só a partir de
 * agosto). O cartão ficava com as compras e sem os pagamentos.
 *
 * O banco lista na fatura cada pagamento que abateu, com valor e dia. Para
 * cada um:
 *  - se o cartão já tem um crédito de transferência desse valor, até 3 dias
 *    de distância (o extrato trouxe, ou o par já existe), nada a fazer;
 *  - se o crédito é a perna que aguarda o extrato (a regra da contraparte a
 *    criou), ela entra no saldo: o extrato do Visa nunca a confirmaria, e em
 *    16/10/2026 os R$ 1.509,30 ficaram fora do saldo do cartão. O crédito que
 *    o extrato trouxe vale antes dela;
 *  - senão, a saída sem par de outra conta (não cartão), do mesmo valor, até
 *    3 dias, a mais próxima, ganha a perna no cartão. A perna entra no saldo
 *    junto com a saída: quem diz que o pagamento aconteceu é o banco.
 *
 * Cada crédito e cada saída servem a um pagamento só.
 */

const JANELA_DIAS = 3
const DIA_MS = 86_400_000
const dia = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
const distancia = (a: string, b: string) => Math.abs(dia(a) - dia(b))

export interface Movimento {
  id: string
  amountCents: number
  date: string
  /** Perna que aguarda o extrato, fora do saldo. Só em crédito do cartão. */
  aguardando?: boolean
}

/**
 * Pagamento a pagamento: as saídas que ganham perna (`ligar`) e as pernas que
 * aguardavam o extrato e entram no saldo (`efetivar`).
 */
export function casarPagamentos(
  pagamentos: readonly PagamentoDoBanco[],
  creditosNoCartao: readonly Movimento[],
  saidas: readonly Movimento[],
): { ligar: Movimento[]; efetivar: Movimento[] } {
  const usados = new Set<string>()
  const ligar: Movimento[] = []
  const efetivar: Movimento[] = []
  // O que já está no saldo primeiro; depois a mais próxima.
  const maisProximo = (lista: readonly Movimento[], valor: number, data: string) =>
    lista
      .filter((m) => !usados.has(m.id) && m.amountCents === valor && distancia(m.date, data) <= JANELA_DIAS * DIA_MS)
      .sort((a, b) => Number(Boolean(a.aguardando)) - Number(Boolean(b.aguardando)) || distancia(a.date, data) - distancia(b.date, data))[0]

  for (const p of [...pagamentos].sort((a, b) => a.date.localeCompare(b.date))) {
    const jaEsta = maisProximo(creditosNoCartao, p.amountCents, p.date)
    if (jaEsta) {
      usados.add(jaEsta.id)
      if (jaEsta.aguardando) efetivar.push(jaEsta)
      continue
    }
    const saida = maisProximo(saidas, -p.amountCents, p.date)
    if (saida) {
      usados.add(saida.id)
      ligar.push(saida)
    }
  }
  return { ligar, efetivar }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Cria no cartão a perna de cada pagamento do banco que ainda não está nele. */
export async function ligarPagamentosAoCartao(
  db: Db,
  orgId: string,
  cartaoId: string,
  pagamentos: readonly PagamentoDoBanco[],
): Promise<number> {
  if (pagamentos.length === 0) return 0
  const datas = pagamentos.map((p) => dia(p.date))
  const de = new Date(Math.min(...datas) - JANELA_DIAS * DIA_MS)
  const ate = new Date(Math.max(...datas) + JANELA_DIAS * DIA_MS)

  const creditos = (await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      aguardaExtrato: transactions.aguardaExtrato,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.accountId, cartaoId),
      eq(transactions.type, 'transfer'),
      gt(transactions.amountCents, 0),
      eq(transactions.isIgnored, false),
      // Perna já absorvida pelo extrato do cartão: o dinheiro é o do extrato.
      isNull(transactions.matchedTransactionId),
      gte(transactions.date, de),
      lte(transactions.date, ate),
    )))
    .map((c) => ({
      id: c.id,
      amountCents: c.amountCents,
      date: iso(c.date),
      aguardando: c.aguardaExtrato && !c.balanceApplied,
    }))

  const linhasDeSaida = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      date: transactions.date,
      description: transactions.description,
      externalId: transactions.externalId,
      balanceApplied: transactions.balanceApplied,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(
      eq(transactions.orgId, orgId),
      ne(transactions.accountId, cartaoId),
      ne(accounts.type, 'credit_card'),
      eq(transactions.type, 'transfer'),
      lt(transactions.amountCents, 0),
      eq(transactions.isIgnored, false),
      isNull(transactions.transferGroupId),
      isNotNull(transactions.externalId),
      inArray(transactions.amountCents, pagamentos.map((p) => -p.amountCents)),
      gte(transactions.date, de),
      lte(transactions.date, ate),
    ))
  const saidas = linhasDeSaida.map((s) => ({ ...s, date: iso(s.date) }))

  const { ligar, efetivar } = casarPagamentos(pagamentos, creditos, saidas)
  if (ligar.length === 0 && efetivar.length === 0) return 0

  const porId = new Map(saidas.map((s) => [s.id, s]))
  await db.transaction(async (tx) => {
    let entrouNoSaldo = 0
    for (const { id } of efetivar) {
      // Só se ainda aguarda: outro sync pode ter efetivado.
      const [efetivada] = await tx
        .update(transactions)
        .set({ aguardaExtrato: false, balanceApplied: true })
        .where(and(
          eq(transactions.id, id),
          eq(transactions.orgId, orgId),
          eq(transactions.aguardaExtrato, true),
          eq(transactions.balanceApplied, false),
        ))
        .returning({ amountCents: transactions.amountCents })
      if (efetivada) entrouNoSaldo += efetivada.amountCents
    }
    for (const { id } of ligar) {
      const saida = porId.get(id)!
      const grupo = crypto.randomUUID()
      // A saída só ganha o par se ainda não tem: outro sync pode ter ligado.
      const [marcada] = await tx
        .update(transactions)
        .set({ transferGroupId: grupo, transferAccountId: cartaoId })
        .where(and(eq(transactions.id, id), eq(transactions.orgId, orgId), isNull(transactions.transferGroupId)))
        .returning({ id: transactions.id })
      if (!marcada) continue
      const perna = buildTransferLegRow(
        { orgId, amountCents: saida.amountCents, date: new Date(`${saida.date}T12:00:00Z`), externalId: saida.externalId!, balanceApplied: saida.balanceApplied },
        cartaoId,
        grupo,
      )
      await tx.insert(transactions).values({ ...perna, description: saida.description })
      if (saida.balanceApplied) entrouNoSaldo += perna.amountCents!
    }
    if (entrouNoSaldo !== 0) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${entrouNoSaldo}` })
        .where(and(eq(accounts.id, cartaoId), eq(accounts.orgId, orgId)))
    }
  })
  return ligar.length + efetivar.length
}
