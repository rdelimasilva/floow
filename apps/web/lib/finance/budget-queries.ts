import { cache } from 'react'
import {
  getDb,
  budgetGoals,
  budgetEntries,
  budgetAdjustments,
  transactions,
  portfolioEvents,
} from '@floow/db'
import { eq, and, sql, gte, lte } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/**
 * Computes start/end Date objects for the current period based on the budget
 * period type. Uses the same logic as getPeriodDates in transaction-filters.tsx
 * but returns Date objects instead of ISO strings and supports semiannual.
 */
export function getCurrentPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (period) {
    case 'monthly':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
    case 'quarterly': {
      const q = Math.floor(m / 3)
      return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0) }
    }
    case 'semiannual': {
      const s = m < 6 ? 0 : 1
      return { start: new Date(y, s * 6, 1), end: new Date(y, s * 6 + 6, 0) }
    }
    case 'annual':
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
    default:
      // Default to monthly if period is unrecognised
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
  }
}

// ---------------------------------------------------------------------------
// Budget goal queries
// ---------------------------------------------------------------------------

/**
 * Returns active budget goals for the given org and type, ordered by createdAt.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getBudgetGoals = cache(async function getBudgetGoals(
  orgId: string,
  type: 'spending' | 'investing',
) {
  const db = getDb()
  return db
    .select()
    .from(budgetGoals)
    .where(
      and(
        eq(budgetGoals.orgId, orgId),
        eq(budgetGoals.type, type),
        eq(budgetGoals.isActive, true),
      ),
    )
    .orderBy(budgetGoals.createdAt)
})

/** Returns budget entries for an org for a specific month. */
export async function getBudgetEntries(orgId: string, periodMonth: Date) {
  const db = getDb()
  return db
    .select()
    .from(budgetEntries)
    .where(and(eq(budgetEntries.orgId, orgId), eq(budgetEntries.periodMonth, periodMonth)))
}

/** Returns all distinct months that have budget entries for an org, ordered by date. */
export async function getBudgetMonths(orgId: string) {
  const db = getDb()
  return db
    .selectDistinct({ periodMonth: budgetEntries.periodMonth })
    .from(budgetEntries)
    .where(eq(budgetEntries.orgId, orgId))
    .orderBy(budgetEntries.periodMonth)
}

// ---------------------------------------------------------------------------
// Spending / investment aggregation
// ---------------------------------------------------------------------------

/**
 * Returns spending totals grouped by category for a date range.
 * Only includes expense transactions that are not ignored.
 */
export async function getSpendingByCategory(
  orgId: string,
  start: Date,
  end: Date,
): Promise<{ categoryId: string | null; spent: number }[]> {
  const db = getDb()

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<number>`SUM(ABS(${transactions.amountCents}))`.as('spent'),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        eq(transactions.isIgnored, false),
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )
    .groupBy(transactions.categoryId)

  return rows.map((r) => ({ categoryId: r.categoryId, spent: Number(r.spent) }))
}

/**
 * Returns the total investment contributions (buy events) for a date range.
 * Uses COALESCE to return 0 when there are no matching events.
 */
export async function getInvestmentContributions(
  orgId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const db = getDb()

  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${portfolioEvents.totalCents}), 0)`.as('total'),
    })
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.orgId, orgId),
        eq(portfolioEvents.eventType, 'buy'),
        gte(portfolioEvents.eventDate, start),
        lte(portfolioEvents.eventDate, end),
      ),
    )

  return Number(row?.total ?? 0)
}

// ---------------------------------------------------------------------------
// Budget adjustments
// ---------------------------------------------------------------------------

/**
 * Returns adjustment rows for a given goal within a date range.
 */
export async function getAdjustments(goalId: string, start: Date, end: Date) {
  const db = getDb()
  return db
    .select()
    .from(budgetAdjustments)
    .where(
      and(
        eq(budgetAdjustments.budgetGoalId, goalId),
        gte(budgetAdjustments.date, start),
        lte(budgetAdjustments.date, end),
      ),
    )
    .orderBy(budgetAdjustments.date)
}

/**
 * Returns the sum of adjustment amounts for a goal within a date range.
 * Uses COALESCE to return 0 when there are no matching adjustments.
 */
export async function getAdjustmentTotal(
  goalId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const db = getDb()

  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${budgetAdjustments.amountCents}), 0)`.as('total'),
    })
    .from(budgetAdjustments)
    .where(
      and(
        eq(budgetAdjustments.budgetGoalId, goalId),
        gte(budgetAdjustments.date, start),
        lte(budgetAdjustments.date, end),
      ),
    )

  return Number(row?.total ?? 0)
}
