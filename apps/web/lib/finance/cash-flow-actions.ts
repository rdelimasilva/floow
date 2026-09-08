'use server'

/**
 * A exceção de fluxo de caixa por lançamento.
 *
 * Vive fora de `actions.ts`, que já passa de 1500 linhas, pelo mesmo motivo de
 * `category-actions.ts` e `recurring-actions.ts`: o limite de 500 linhas do
 * CLAUDE.md.
 *
 * Action própria e não um campo em `updateTransaction` por dois motivos:
 * aquela recusa transferência (`Cannot edit transfer transactions`) e faz toda
 * a matemática de reverter e reaplicar saldo. Marcar um lançamento como fora
 * do fluxo de caixa não mexe em saldo nenhum — o dinheiro se moveu de
 * verdade, só não é resultado. Passar por lá seria arriscar saldo por nada.
 */

import { and, eq } from 'drizzle-orm'
import { getDb, transactions } from '@floow/db'
import { getOrgId } from './queries'
import { revalidateTransactionData } from './revalidate'

/**
 * Grava a exceção num lançamento da org.
 *
 * A cerca de posse é a mesma de `assertAccountOwnership`: sem ela um id de
 * outra org viraria UPDATE cross-tenant, e o `.where` com `orgId` sozinho
 * falharia em silêncio (zero linhas afetadas, nenhum erro), o que é pior —
 * a UI mostraria sucesso.
 */
export async function setTransactionAffectsCashFlow(
  transactionId: string,
  value: boolean | null,
): Promise<void> {
  const orgId = await getOrgId()
  const db = getDb()

  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!row) throw new Error('Lançamento não encontrado nesta organização.')

  await db
    .update(transactions)
    .set({ affectsCashFlow: value })
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))

  revalidateTransactionData(orgId)
}
