import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getDb, accounts, transactions, categories, patrimonySnapshots, categoryRules } from '@floow/db'
import { eq, and, desc, isNull, or, gte, count, ilike, lte } from 'drizzle-orm'

/**
 * Extracts the orgId from the authenticated user's JWT app_metadata.
 * Uses getSession() (local cookie read, no network) since middleware already validated JWT.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getOrgId = cache(async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Not authenticated')
  }

  const orgId = session.user.app_metadata?.org_ids?.[0]
  if (!orgId) {
    throw new Error('No organization found for user')
  }

  return orgId as string
})

/**
 * Returns all active accounts for the given org, ordered by name.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getAccounts = cache(async function getAccounts(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .orderBy(accounts.name)
})

/**
 * Returns a single account by ID, verifying org ownership.
 * Returns null if account not found or doesn't belong to the org.
 */
export const getAccountById = cache(async function getAccountById(orgId: string, accountId: string) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .limit(1)

  return account ?? null
})

/**
 * Returns transactions for the given org with optional filters.
 * Joined with category data (name, color, icon).
 * Supports search, date range, and account filtering.
 */
export async function getTransactions(
  orgId: string,
  opts?: { limit?: number; offset?: number; accountId?: string; search?: string; startDate?: string; endDate?: string }
) {
  const db = getDb()
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) conditions.push(lte(transactions.date, new Date(opts.endDate)))

  return db
    .select({
      id: transactions.id,
      orgId: transactions.orgId,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      date: transactions.date,
      transferGroupId: transactions.transferGroupId,
      importedAt: transactions.importedAt,
      externalId: transactions.externalId,
      isAutoCategorized: transactions.isAutoCategorized,
      isIgnored: transactions.isIgnored,
      recurringTemplateId: transactions.recurringTemplateId,
      balanceApplied: transactions.balanceApplied,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.balanceApplied), desc(transactions.date))
    .limit(limit)
    .offset(offset)
}

/**
 * Returns total count of transactions matching the given filters.
 * Used for pagination alongside getTransactions.
 */
export async function getTransactionCount(
  orgId: string,
  opts?: { accountId?: string; search?: string; startDate?: string; endDate?: string }
) {
  const db = getDb()

  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) conditions.push(lte(transactions.date, new Date(opts.endDate)))

  const [result] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(...conditions))

  return result.total
}

/**
 * Returns categories for the given org plus system-wide categories (orgId IS NULL).
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getCategories = cache(async function getCategories(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(categories)
    .where(or(eq(categories.orgId, orgId), isNull(categories.orgId)))
    .orderBy(categories.type, categories.name)
})

/**
 * Returns the most recent patrimony snapshot for the given org, or null if none exists.
 */
export async function getLatestSnapshot(orgId: string) {
  const db = getDb()
  const results = await db
    .select()
    .from(patrimonySnapshots)
    .where(eq(patrimonySnapshots.orgId, orgId))
    .orderBy(desc(patrimonySnapshots.snapshotDate))
    .limit(1)

  return results[0] ?? null
}

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

/**
 * Returns transactions from the last N months for cash flow chart aggregation.
 * Defaults to 6 months. Ordered by date descending.
 */
export async function getRecentTransactions(orgId: string, months: number = 6) {
  const db = getDb()

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)

  return db
    .select({
      id: transactions.id,
      orgId: transactions.orgId,
      accountId: transactions.accountId,
      type: transactions.type,
      amountCents: transactions.amountCents,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), gte(transactions.date, cutoff), eq(transactions.isIgnored, false), eq(transactions.balanceApplied, true)))
    .orderBy(desc(transactions.date))
}
