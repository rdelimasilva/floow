import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDb, accounts, transactions, categories, patrimonySnapshots, categoryRules } from '@floow/db'
import { eq, and, desc, asc, isNull, or, gte, count, ilike, lte, inArray, sql } from 'drizzle-orm'
import {
  accountsTag,
  categoriesTag,
  futureTransactionsTag,
  recentTransactionsTag,
  snapshotsTag,
} from '@/lib/cache-tags'

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
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
        .orderBy(accounts.name)
    },
    ['finance-accounts', orgId],
    { tags: [accountsTag(orgId)], revalidate: 300 },
  )()
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

/** Filter options shared between getTransactions queries. */
interface TransactionFilterOpts {
  accountId?: string; search?: string;
  startDate?: string; endDate?: string;
  types?: string; categoryIds?: string;
  minAmount?: number; maxAmount?: number;
}

interface TransactionQueryOpts extends TransactionFilterOpts {
  limit?: number
  offset?: number
  sortBy?: string
  sortDir?: string
}

/** Builds WHERE conditions for transaction queries — single source of truth. */
function buildTransactionConditions(orgId: string, opts?: TransactionFilterOpts) {
  const conditions = [eq(transactions.orgId, orgId)]

  if (opts?.accountId) conditions.push(eq(transactions.accountId, opts.accountId))
  if (opts?.search) conditions.push(ilike(transactions.description, `%${opts.search}%`))
  if (opts?.startDate) conditions.push(gte(transactions.date, new Date(opts.startDate)))
  if (opts?.endDate) conditions.push(lte(transactions.date, new Date(opts.endDate)))

  if (opts?.types) {
    const typeList = opts.types.split(',').filter(Boolean) as ('income' | 'expense' | 'transfer')[]
    if (typeList.length > 0) conditions.push(inArray(transactions.type, typeList))
  }
  if (opts?.categoryIds) {
    const catList = opts.categoryIds.split(',').filter(Boolean)
    if (catList.length > 0) conditions.push(inArray(transactions.categoryId, catList))
  }
  if (opts?.minAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) >= ${opts.minAmount}`)
  }
  if (opts?.maxAmount !== undefined) {
    conditions.push(sql`ABS(${transactions.amountCents}) <= ${opts.maxAmount}`)
  }

  return conditions
}

function buildTransactionOrder(opts?: Pick<TransactionQueryOpts, 'sortBy' | 'sortDir'>) {
  const sortColumns: Record<string, any> = {
    date: transactions.date,
    description: transactions.description,
    categoryName: categories.name,
    type: transactions.type,
    amountCents: transactions.amountCents,
  }

  const sortCol = sortColumns[opts?.sortBy ?? 'date'] ?? transactions.date
  const sortFn = opts?.sortDir === 'asc' ? asc : desc

  return [desc(transactions.balanceApplied), sortFn(sortCol)] as const
}

/**
 * Returns transactions + total count in a SINGLE query using COUNT(*) OVER().
 * Eliminates the extra round-trip that getTransactionCount required.
 * Joined with category data (name, color, icon).
 */
export async function getTransactionsWithCount(
  orgId: string,
  opts?: TransactionQueryOpts
) {
  const db = getDb()
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  const conditions = buildTransactionConditions(orgId, opts)
  const orderBy = buildTransactionOrder(opts)

  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      date: transactions.date,
      transferGroupId: transactions.transferGroupId,
      externalId: transactions.externalId,
      isAutoCategorized: transactions.isAutoCategorized,
      isIgnored: transactions.isIgnored,
      recurringTemplateId: transactions.recurringTemplateId,
      balanceApplied: transactions.balanceApplied,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset)

  const totalCount = rows.length < limit
    ? offset + rows.length
    : await db
        .select({ total: count() })
        .from(transactions)
        .where(and(...conditions))
        .then((result) => result[0]?.total ?? 0)

  return { transactions: rows, totalCount }
}

/**
 * Returns the starting balance for running-balance display on the current page.
 * For DESC sort: totalSum - sum of transactions on earlier pages (newer txns).
 * For ASC sort: sum of transactions on earlier pages (older txns).
 */
export async function getPageStartBalance(
  orgId: string,
  opts?: TransactionQueryOpts,
): Promise<number> {
  const db = getDb()
  const offset = opts?.offset ?? 0
  const sortDir = opts?.sortDir ?? 'desc'
  const conditions = buildTransactionConditions(orgId, opts)

  const [totalResult] = await db
    .select({ sum: sql<string>`COALESCE(SUM(${transactions.amountCents}), 0)` })
    .from(transactions)
    .where(and(...conditions))
  const totalSum = Number(totalResult.sum)

  if (offset === 0) {
    return sortDir === 'desc' ? totalSum : 0
  }

  const orderBy = buildTransactionOrder(opts)
  const prevRows = await db
    .select({ amountCents: transactions.amountCents })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(offset)
  const prevSum = prevRows.reduce((acc, r) => acc + r.amountCents, 0)

  return sortDir === 'desc' ? totalSum - prevSum : prevSum
}

/**
 * Returns category IDs ordered by usage frequency (most used first).
 * Used to sort category dropdowns with most-used at top.
 */
export async function getCategoryUsageOrder(orgId: string): Promise<string[]> {
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
}

/**
 * Returns categories for the given org plus system-wide categories (orgId IS NULL).
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getCategories = cache(async function getCategories(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(categories)
        .where(or(eq(categories.orgId, orgId), isNull(categories.orgId)))
        .orderBy(categories.type, categories.name)
    },
    ['finance-categories', orgId],
    { tags: [categoriesTag(orgId)], revalidate: 60 },
  )()
})

/**
 * Returns the most recent patrimony snapshot for the given org, or null if none exists.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getLatestSnapshot = cache(async function getLatestSnapshot(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const results = await db
        .select()
        .from(patrimonySnapshots)
        .where(eq(patrimonySnapshots.orgId, orgId))
        .orderBy(desc(patrimonySnapshots.snapshotDate))
        .limit(1)

      return results[0] ?? null
    },
    ['finance-latest-snapshot', orgId],
    { tags: [snapshotsTag(orgId)], revalidate: 300 },
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

/**
 * Returns transactions from the last N months for cash flow chart aggregation.
 * Defaults to 6 months. Ordered by date descending.
 * Wrapped in React cache() to deduplicate within a single request (e.g., dashboard
 * calls this twice from StatsSection and ChartSection — cache prevents double DB round-trip).
 */
export const getRecentTransactions = cache(async function getRecentTransactions(orgId: string, months: number = 6) {
  return unstable_cache(
    async () => {
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
    },
    ['finance-recent-transactions', orgId, String(months)],
    { tags: [recentTransactionsTag(orgId, months)], revalidate: 180 },
  )().then((rows) =>
    rows.map((row) => ({
      ...row,
      date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
    }))
  )
})

/**
 * Returns future transactions (balance_applied = false) for cash flow projection.
 * These are recurring installments with date > today that haven't impacted the balance yet.
 */
export async function getFutureTransactions(orgId: string, months: number = 24) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + months)

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
        .where(and(
          eq(transactions.orgId, orgId),
          eq(transactions.balanceApplied, false),
          eq(transactions.isIgnored, false),
          lte(transactions.date, endDate),
        ))
        .orderBy(asc(transactions.date))
    },
    ['finance-future-transactions', orgId, String(months)],
    { tags: [futureTransactionsTag(orgId, months)], revalidate: 180 },
  )().then((rows) =>
    rows.map((row) => ({
      ...row,
      date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
    }))
  )
}
