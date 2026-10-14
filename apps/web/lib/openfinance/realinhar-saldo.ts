import { and, eq, sql } from 'drizzle-orm'
import { accounts } from '@floow/db'
import type { Db } from './persist-page'

/**
 * O saldo gravado (`accounts.balance_cents`) é a soma dos lançamentos que
 * estão no saldo: aplicados e não ignorados. Ele é mantido por incremento, e
 * um incremento errado diverge em silêncio para sempre (13/10: a exclusão
 * de um par com a perna ignorada tirou R$ 11.685,40 do Master Black). Depois
 * de cada sync a conta é realinhada à soma, numa instrução só.
 *
 * Não é ajuste contra o banco: a soma continua sendo a dos lançamentos do
 * app. Divergência encontrada é registrada — ela aponta um caminho que
 * incrementa errado.
 */
export async function realinharSaldoGravado(db: Db, orgId: string, accountId: string): Promise<number> {
  const soma = sql`(SELECT COALESCE(SUM(t.amount_cents), 0) FROM transactions t
    WHERE t.account_id = ${accountId} AND t.org_id = ${orgId} AND t.balance_applied AND NOT t.is_ignored)`
  const [linha] = await db
    .update(accounts)
    .set({ balanceCents: soma })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), sql`${accounts.balanceCents} <> ${soma}`))
    .returning({ balanceCents: accounts.balanceCents })
  if (!linha) return 0
  console.error(`[sync] saldo gravado da conta ${accountId} divergia da soma dos lançamentos; realinhado para ${linha.balanceCents}`)
  return 1
}
