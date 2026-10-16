import { accounts, transactions, type getDb } from '@floow/db'
import { and, eq, sql } from 'drizzle-orm'

type Db = ReturnType<typeof getDb>

/**
 * A cópia sai das somas: `is_ignored`, e o saldo devolve o que ela tinha
 * somado. Um caminho só para o clique de "aprovar" na fila e para a cópia
 * certa que o sync resolve sozinho (`mesmaCompra`).
 *
 * Devolve `false` quando a linha não existe ou já foi ignorada por outro
 * caminho: estornar de novo tiraria do saldo duas vezes.
 *
 * O estorno só vale para o que ENTROU no saldo: um agendado do Open Finance
 * entra com `balance_applied = false` e nunca foi somado.
 */
export async function efetivarDuplicata(tx: Db, orgId: string, duplicataId: string): Promise<boolean> {
  const [duplicata] = await tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      balanceApplied: transactions.balanceApplied,
      isIgnored: transactions.isIgnored,
    })
    .from(transactions)
    .where(and(eq(transactions.id, duplicataId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!duplicata || duplicata.isIgnored) return false

  await tx
    .update(transactions)
    .set({ isIgnored: true })
    .where(and(eq(transactions.id, duplicata.id), eq(transactions.orgId, orgId)))

  if (duplicata.balanceApplied) {
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-duplicata.amountCents}` })
      .where(and(eq(accounts.id, duplicata.accountId), eq(accounts.orgId, orgId)))
  }
  return true
}
