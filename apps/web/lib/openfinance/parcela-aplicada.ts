import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { accounts, transactions } from '@floow/db'
import type { Db } from './persist-page'

/**
 * Parcela de cartão já dentro do saldo cuja data correta mudou no sync.
 *
 * A data da parcela é derivada da fatura, e a fatura que a Polp manda pode
 * estar errada e ser corrigida depois (bill_post_date = data da compra punha
 * todas as parcelas no dia da compra, dentro do saldo). O update de
 * `persistPage` não mexe na data de linha aplicada; sem isto a correção
 * ficava presa para sempre.
 *
 *  - Nova data já chegou: só a data muda. O valor já está no saldo e
 *    continua lá — a data não entra na conta do saldo.
 *  - Nova data no futuro: a linha sai do saldo e o valor volta para a conta.
 *    `applyDueBankTransactions` a põe de volta quando a data chegar.
 *
 * Só parcela (`purchase_date` preenchida), linha do extrato, fora de vínculo.
 * A saída do saldo é atômica como `ocuparPrevisao`: o UPDATE só pega a linha
 * se ela ainda estiver aplicada, então dois syncs concorrentes não devolvem
 * o valor duas vezes.
 */
export async function corrigirDataDaParcelaAplicada(
  db: Db,
  input: { orgId: string; accountId: string; transactionId: string; dataFinal: string; hoje: string },
): Promise<'saiu_do_saldo' | 'so_a_data' | 'nada'> {
  const novaData = new Date(`${input.dataFinal}T12:00:00Z`)
  const daLinha = and(
    eq(transactions.id, input.transactionId),
    eq(transactions.orgId, input.orgId),
    eq(transactions.accountId, input.accountId),
    eq(transactions.balanceApplied, true),
    isNotNull(transactions.purchaseDate),
    isNotNull(transactions.externalId),
    isNull(transactions.transferGroupId),
    ne(transactions.date, sql`${input.dataFinal}::date`),
    // Realizado que cumpre uma previsão: tirá-lo do saldo deixaria a previsão
    // "cumprida" por algo fora do saldo.
    sql`NOT EXISTS (SELECT 1 FROM transactions AS p WHERE p.matched_transaction_id = ${transactions.id})`,
  )

  if (input.dataFinal <= input.hoje) {
    await db.update(transactions).set({ date: novaData }).where(daLinha)
    return 'so_a_data'
  }

  return db.transaction(async (tx) => {
    const [saiu] = await tx
      .update(transactions)
      .set({ date: novaData, balanceApplied: false })
      .where(daLinha)
      .returning({ amountCents: transactions.amountCents })
    if (!saiu) return 'nada' as const
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents - ${saiu.amountCents}` })
      .where(and(eq(accounts.id, input.accountId), eq(accounts.orgId, input.orgId)))
    return 'saiu_do_saldo' as const
  })
}
