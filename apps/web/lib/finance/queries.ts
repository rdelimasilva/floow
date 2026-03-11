'use server'

import { createClient } from '@/lib/supabase/server'
import { createDb, accounts, transactions, categories, patrimonySnapshots } from '@floow/db'
import { eq, and, desc, isNull, or, gte } from 'drizzle-orm'
import { assertEnv } from '@floow/shared'

const DATABASE_URL = assertEnv('DATABASE_URL')

/**
 * Extracts the orgId from the authenticated user's JWT app_metadata.
 * Throws if no user or no orgId is found.
 */
export async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('Not authenticated')
  }

  const orgId = user.app_metadata?.org_ids?.[0]
  if (!orgId) {
    throw new Error('No organization found for user')
  }

  return orgId as string
}

/**
 * Returns all active accounts for the given org, ordered by name.
 */
export async function getAccounts(orgId: string) {
  const db = createDb(DATABASE_URL)
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .orderBy(accounts.name)
}

/**
 * Returns transactions for the given org with optional filters.
 * Joined with category data (name, color, icon).
 */
export async function getTransactions(
  orgId: string,
  opts?: { limit?: number; offset?: number; accountId?: string }
) {
  const db = createDb(DATABASE_URL)
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  const baseWhere = opts?.accountId
    ? and(eq(transactions.orgId, orgId), eq(transactions.accountId, opts.accountId))
    : eq(transactions.orgId, orgId)

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
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(baseWhere)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset)
}

/**
 * Returns categories for the given org plus system-wide categories (orgId IS NULL).
 */
export async function getCategories(orgId: string) {
  const db = createDb(DATABASE_URL)
  return db
    .select()
    .from(categories)
    .where(or(eq(categories.orgId, orgId), isNull(categories.orgId)))
    .orderBy(categories.type, categories.name)
}

/**
 * Returns the most recent patrimony snapshot for the given org, or null if none exists.
 */
export async function getLatestSnapshot(orgId: string) {
  const db = createDb(DATABASE_URL)
  const results = await db
    .select()
    .from(patrimonySnapshots)
    .where(eq(patrimonySnapshots.orgId, orgId))
    .orderBy(desc(patrimonySnapshots.snapshotDate))
    .limit(1)

  return results[0] ?? null
}

/**
 * Returns transactions from the last N months for cash flow chart aggregation.
 * Defaults to 6 months. Ordered by date descending.
 */
export async function getRecentTransactions(orgId: string, months: number = 6) {
  const db = createDb(DATABASE_URL)

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
    .where(and(eq(transactions.orgId, orgId), gte(transactions.date, cutoff)))
    .orderBy(desc(transactions.date))
}
