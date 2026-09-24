import { and, desc, eq } from 'drizzle-orm'
import { categorySuggestions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

export interface PendingSuggestion {
  id: string
  kind: 'uncategorized' | 'split'
  suggestedName: string
  parentCategoryId: string | null
  txCount: number
  totalCents: number
  monthlyAvgCents: number
}

/** Sem cache: a lista muda a cada aceite/recusa e é pequena (≤ 10). */
export async function getPendingCategorySuggestions(orgId: string): Promise<PendingSuggestion[]> {
  return withUserDb((tx) =>
    tx
      .select({
        id: categorySuggestions.id,
        kind: categorySuggestions.kind,
        suggestedName: categorySuggestions.suggestedName,
        parentCategoryId: categorySuggestions.parentCategoryId,
        txCount: categorySuggestions.txCount,
        totalCents: categorySuggestions.totalCents,
        monthlyAvgCents: categorySuggestions.monthlyAvgCents,
      })
      .from(categorySuggestions)
      .where(and(eq(categorySuggestions.orgId, orgId), eq(categorySuggestions.status, 'pending')))
      .orderBy(desc(categorySuggestions.totalCents)),
  )
}
