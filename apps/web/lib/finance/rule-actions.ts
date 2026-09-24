'use server'
import { getDb, categoryRules, transactions } from '@floow/db'

import { eq, and, ilike, isNull, count } from 'drizzle-orm'
import { getOrgId, getCategoryRules } from './queries'
import { escapeLikePattern } from './sql-utils'
import { revalidateCategoryData, revalidateTransactionData } from './revalidate'

// ---------------------------------------------------------------------------
// Categorization Rule Actions — CAT-01, CAT-02, CAT-06
// ---------------------------------------------------------------------------

/**
 * Calculates priority automatically based on rule specificity.
 * - 'exact' rules get higher base priority than 'contains'
 * - Longer matchValue = more specific = higher priority
 */
function calcRulePriority(matchType: string, matchValue: string): number {
  const base = matchType === 'exact' ? 1000 : 0
  return base + matchValue.trim().length
}

/**
 * Server action: create a new categorization rule for the authenticated org.
 * Priority is auto-calculated from specificity (exact > contains, longer > shorter).
 * CAT-01
 */
export async function createRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const matchType = formData.get('matchType') as string
  const matchValue = formData.get('matchValue') as string
  const categoryId = formData.get('categoryId') as string

  if (!matchType || !matchValue || !categoryId) {
    throw new Error('matchType, matchValue, and categoryId are required')
  }
  if (!['contains', 'exact'].includes(matchType)) {
    throw new Error('Invalid matchType — must be "contains" or "exact"')
  }
  if (!matchValue.trim()) {
    throw new Error('matchValue must not be empty')
  }

  const priority = calcRulePriority(matchType, matchValue)

  const [rule] = await db
    .insert(categoryRules)
    .values({
      orgId,
      matchType: matchType as 'contains' | 'exact',
      matchValue: matchValue.trim(),
      categoryId,
      priority,
      isEnabled: true,
    })
    .returning()

  revalidateCategoryData(orgId)
  return rule
}

/**
 * Server action: update fields of an existing categorization rule.
 * Only updates provided fields; always updates updatedAt.
 * CAT-02
 */
export async function updateRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  const setObj: Record<string, unknown> = { updatedAt: new Date() }

  const matchType = formData.get('matchType') as string | null
  if (matchType !== null) {
    if (!['contains', 'exact'].includes(matchType)) {
      throw new Error('Invalid matchType — must be "contains" or "exact"')
    }
    setObj.matchType = matchType
  }

  const matchValue = formData.get('matchValue') as string | null
  if (matchValue !== null) {
    if (!matchValue.trim()) throw new Error('matchValue must not be empty')
    setObj.matchValue = matchValue.trim()
  }

  const categoryId = formData.get('categoryId') as string | null
  if (categoryId !== null) setObj.categoryId = categoryId

  // Recalculate priority if matchType or matchValue changed
  const finalMatchType = (setObj.matchType as string) ?? null
  const finalMatchValue = (setObj.matchValue as string) ?? null
  if (finalMatchType || finalMatchValue) {
    // Need current values for fields not being updated
    const [current] = await db
      .select({ matchType: categoryRules.matchType, matchValue: categoryRules.matchValue })
      .from(categoryRules)
      .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))
      .limit(1)
    if (current) {
      setObj.priority = calcRulePriority(
        finalMatchType ?? current.matchType,
        finalMatchValue ?? current.matchValue,
      )
    }
  }

  await db
    .update(categoryRules)
    .set(setObj)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: delete a categorization rule scoped to the authenticated org.
 * CAT-02
 */
export async function deleteRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  await db
    .delete(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: move a rule up or down in priority order by swapping priority values.
 * Swaps the target rule with its adjacent neighbour (direction: 'up' = higher priority, 'down' = lower).
 * No-op if the rule is already at the boundary.
 * CAT-02
 */
export async function reorderRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  const direction = formData.get('direction') as string
  if (!id) throw new Error('Rule ID is required')
  if (direction !== 'up' && direction !== 'down') throw new Error('direction must be "up" or "down"')

  // Fetch all rules sorted by priority DESC
  const rules = await getCategoryRules(orgId)
  const idx = rules.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('Rule not found')

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rules.length) return // already at boundary

  const a = rules[idx]
  const b = rules[swapIdx]

  await db.transaction(async (tx) => {
    await tx
      .update(categoryRules)
      .set({ priority: b.priority, updatedAt: new Date() })
      .where(and(eq(categoryRules.id, a.id), eq(categoryRules.orgId, orgId)))
    await tx
      .update(categoryRules)
      .set({ priority: a.priority, updatedAt: new Date() })
      .where(and(eq(categoryRules.id, b.id), eq(categoryRules.orgId, orgId)))
  })

  revalidateCategoryData(orgId)
}

/**
 * Server action: toggle the isEnabled flag on a categorization rule.
 * CAT-02
 */
export async function toggleEnabled(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  await db
    .update(categoryRules)
    .set({ isEnabled: !rule.isEnabled, updatedAt: new Date() })
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: preview how many uncategorized transactions would be affected by a rule.
 * Returns { count } without modifying any data.
 * CAT-06
 */
export async function previewBulkRecategorize(formData: FormData): Promise<{ count: number }> {
  const orgId = await getOrgId()
  const db = getDb()

  const ruleId = formData.get('ruleId') as string
  if (!ruleId) throw new Error('ruleId is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  const matchCondition =
    rule.matchType === 'exact'
      ? ilike(transactions.description, rule.matchValue)
      : ilike(transactions.description, `%${escapeLikePattern(rule.matchValue)}%`)

  const [result] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), isNull(transactions.categoryId), matchCondition))

  return { count: result.total }
}

/**
 * Server action: retroactively apply a rule to all uncategorized matching transactions.
 * Only affects transactions where categoryId IS NULL (never overwrites manual categories).
 * Sets isAutoCategorized=true on updated rows.
 * CAT-06
 */
export async function bulkRecategorize(formData: FormData): Promise<{ updated: number }> {
  const orgId = await getOrgId()
  const db = getDb()

  const ruleId = formData.get('ruleId') as string
  if (!ruleId) throw new Error('ruleId is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  const matchCondition =
    rule.matchType === 'exact'
      ? ilike(transactions.description, rule.matchValue)
      : ilike(transactions.description, `%${escapeLikePattern(rule.matchValue)}%`)

  const updated = await db
    .update(transactions)
    .set({ categoryId: rule.categoryId, isAutoCategorized: true })
    .where(and(eq(transactions.orgId, orgId), isNull(transactions.categoryId), matchCondition))
    .returning({ id: transactions.id })

  revalidateTransactionData(orgId)
  revalidateCategoryData(orgId)

  return { updated: updated.length }
}
