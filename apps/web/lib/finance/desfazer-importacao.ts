'use server'

import { and, eq } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from './queries'
import { bulkDeleteTransactions } from './transaction-actions'

/**
 * Desfaz uma importação de extrato.
 *
 * `lote` é o `importedAt` que `importSelectedTransactions` gravou em todas as
 * linhas da importação — o mesmo instante para o lote inteiro. A perna de
 * destino das transferências não leva `importedAt`, mas a exclusão em lote
 * remove as duas pernas pelo `transferGroupId` e reverte os saldos.
 */
export async function desfazerImportacao(accountId: string, lote: string): Promise<number> {
  const importedAt = new Date(lote)
  if (Number.isNaN(importedAt.getTime())) throw new Error('Importação não identificada.')

  const orgId = await getOrgId()
  const linhas = await withUserDb((db) =>
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.accountId, accountId),
          eq(transactions.importedAt, importedAt),
        ),
      ),
  )

  if (linhas.length === 0) return 0
  await bulkDeleteTransactions(linhas.map((l) => l.id))
  return linhas.length
}
