import { getDb, recurringTemplates } from '@floow/db'
import { eq, and, asc, lte } from 'drizzle-orm'

/**
 * Returns all recurring templates for an org, ordered by nextDueDate ASC.
 */
export async function getRecurringTemplates(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.orgId, orgId))
    .orderBy(asc(recurringTemplates.nextDueDate))
}

/**
 * Returns active templates due within the next 30 days, ordered by nextDueDate ASC.
 * Used for the "upcoming due" section on /transactions/recurring.
 */
export async function getUpcomingRecurring(orgId: string) {
  const db = getDb()
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000)

  return db
    .select()
    .from(recurringTemplates)
    .where(
      and(
        eq(recurringTemplates.orgId, orgId),
        eq(recurringTemplates.isActive, true),
        lte(recurringTemplates.nextDueDate, thirtyDaysFromNow),
      )
    )
    .orderBy(asc(recurringTemplates.nextDueDate))
}
