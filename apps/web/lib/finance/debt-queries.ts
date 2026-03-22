import { cache } from 'react'
import { getDb, debts, transactions } from '@floow/db'
import { eq, and, sql } from 'drizzle-orm'

/** Returns all active debts for the org. */
export const getDebts = cache(async function getDebts(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(debts)
    .where(and(eq(debts.orgId, orgId), eq(debts.isActive, true)))
    .orderBy(debts.startDate)
})

/** Returns payment progress for a debt by counting/summing transactions with matching category. */
export async function getDebtProgress(orgId: string, categoryId: string) {
  const db = getDb()
  const [row] = await db
    .select({
      paidCount: sql<number>`COUNT(*)`.as('paid_count'),
      paidCents: sql<number>`COALESCE(SUM(ABS(${transactions.amountCents})), 0)`.as('paid_cents'),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, 'expense'),
        eq(transactions.isIgnored, false),
      )
    )
  return { paidCount: Number(row.paidCount), paidCents: Number(row.paidCents) }
}

/** Returns payment progress for multiple debts at once (batch). */
export async function getDebtsWithProgress(orgId: string) {
  const allDebts = await getDebts(orgId)

  const results = await Promise.all(
    allDebts.map(async (debt) => {
      const progress = await getDebtProgress(orgId, debt.categoryId)
      const remainingCents = debt.totalCents - progress.paidCents
      const paidMonths = progress.paidCount

      // Next due date = start_date + paidMonths months
      const nextDue = new Date(debt.startDate)
      nextDue.setMonth(nextDue.getMonth() + paidMonths)

      return {
        ...debt,
        paidCount: progress.paidCount,
        paidCents: progress.paidCents,
        remainingCents: Math.max(0, remainingCents),
        progressPct: debt.totalCents > 0 ? Math.round((progress.paidCents / debt.totalCents) * 100) : 0,
        nextDueDate: nextDue,
      }
    })
  )

  return results
}
