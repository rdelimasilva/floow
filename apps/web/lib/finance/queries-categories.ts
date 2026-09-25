import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, transactions, categories, categoryRules, hiddenSystemCategories } from '@floow/db'
import { eq, and, or, isNull, notExists, desc, count, sql } from 'drizzle-orm'
import { categoriesTag } from '@/lib/cache-tags'

/**
 * Returns category IDs ordered by usage frequency (most used first).
 * Used to sort category dropdowns with most-used at top.
 */
export async function getCategoryUsageOrder(orgId: string): Promise<string[]> {
  return unstable_cache(
    async () => {
      const db = getDb()
      const rows = await db
        .select({
          categoryId: transactions.categoryId,
          cnt: count(),
        })
        .from(transactions)
        .where(and(eq(transactions.orgId, orgId), sql`${transactions.categoryId} IS NOT NULL`))
        .groupBy(transactions.categoryId)
        .orderBy(desc(count()))
        .limit(50)

      return rows.map((r) => r.categoryId!)
    },
    ['finance-category-usage-order', orgId],
    // Sem a tag de lançamentos de propósito: ela expira a cada edição, e a
    // ordem do dropdown (só um palpite de "mais usadas") era recalculada com
    // um GROUP BY sobre a org inteira a cada clique na lista.
    { revalidate: 3600 },
  )()
}

/**
 * Returns categories for the given org plus system-wide categories (orgId IS NULL).
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getCategories = cache(async function getCategories(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      // Categoria de sistema que ESTA org escondeu sai da lista. A linha
      // continua existindo para as outras orgs — ver 00029 e category-actions.
      return db
        .select()
        .from(categories)
        .where(
          and(
            or(eq(categories.orgId, orgId), isNull(categories.orgId)),
            notExists(
              db
                .select({ one: sql`1` })
                .from(hiddenSystemCategories)
                .where(
                  and(
                    eq(hiddenSystemCategories.orgId, orgId),
                    eq(hiddenSystemCategories.categoryId, categories.id),
                  ),
                ),
            ),
          ),
        )
        .orderBy(categories.type, categories.name)
    },
    ['finance-categories', orgId],
    { tags: [categoriesTag(orgId)], revalidate: 60 },
  )()
})

/**
 * Returns all categorization rules for the given org, ordered by priority DESC.
 * Pre-sorted so callers can pass the result directly to matchCategory() without re-sorting.
 * Does NOT filter by isEnabled — callers must filter enabled rules before calling matchCategory().
 */
export async function getCategoryRules(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.orgId, orgId))
    .orderBy(desc(categoryRules.priority))
}
