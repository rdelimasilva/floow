import { cache } from 'react'
import { getDb, retirementPlans, withdrawalStrategies, successionPlans, heirs } from '@floow/db'
import { eq, and } from 'drizzle-orm'

/**
 * Returns the saved retirement plan for the given org, or null if none saved.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getRetirementPlan = cache(async function getRetirementPlan(orgId: string) {
  const db = getDb()
  const results = await db
    .select()
    .from(retirementPlans)
    .where(eq(retirementPlans.orgId, orgId))
    .limit(1)
  return results[0] ?? null
})

/**
 * Returns the saved withdrawal strategy for the given org, or null if none saved.
 */
export const getWithdrawalStrategy = cache(async function getWithdrawalStrategy(orgId: string) {
  const db = getDb()
  const results = await db
    .select()
    .from(withdrawalStrategies)
    .where(eq(withdrawalStrategies.orgId, orgId))
    .limit(1)
  return results[0] ?? null
})

/**
 * Returns the saved succession plan for the given org, or null if none saved.
 */
export const getSuccessionPlan = cache(async function getSuccessionPlan(orgId: string) {
  const db = getDb()
  const results = await db
    .select()
    .from(successionPlans)
    .where(eq(successionPlans.orgId, orgId))
    .limit(1)
  return results[0] ?? null
})

/**
 * Returns all heirs for the given succession plan and org.
 */
export const getHeirs = cache(async function getHeirs(
  orgId: string,
  successionPlanId: string
) {
  const db = getDb()
  return db
    .select()
    .from(heirs)
    .where(and(eq(heirs.orgId, orgId), eq(heirs.successionPlanId, successionPlanId)))
})

/**
 * Fetches all planning dashboard data in parallel: retirement plan, withdrawal strategy, succession plan.
 * Used by the planning hub page.
 */
export const getPlanningDashboardData = cache(async function getPlanningDashboardData(
  orgId: string
) {
  const [retirementPlan, withdrawalStrategy, successionPlan] = await Promise.all([
    getRetirementPlan(orgId),
    getWithdrawalStrategy(orgId),
    getSuccessionPlan(orgId),
  ])

  return { retirementPlan, withdrawalStrategy, successionPlan }
})
