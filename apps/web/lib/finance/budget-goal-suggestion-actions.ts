'use server'

/**
 * Descartar sugestão de meta do Plano de Gastos: grava a categoria e a
 * sugestão não volta para a org (00060).
 */
import { revalidatePath } from 'next/cache'
import { budgetGoalSuggestionDismissals } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { getOrgId } from './queries'

export async function dismissBudgetGoalSuggestion(categoryId: string): Promise<void> {
  if (!categoryId) throw new Error('Categoria obrigatória')
  const orgId = await getOrgId()
  await withUserDb((tx) =>
    tx.insert(budgetGoalSuggestionDismissals).values({ orgId, categoryId }).onConflictDoNothing(),
  )
  revalidatePath('/budgets/spending')
}
