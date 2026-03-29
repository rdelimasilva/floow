import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import {
  getDb,
  retirementPlans,
  withdrawalStrategies,
  successionPlans,
  heirs,
  simulationScenarios,
} from '@floow/db'
import { eq, and, sql, desc } from 'drizzle-orm'
import {
  incomeEventsTag,
  investmentsTag,
  planningSummaryTag,
  pricesTag,
} from '@/lib/cache-tags'

export interface RetirementPlanSummary {
  currentAge: number
  retirementAge: number
  lifeExpectancy: number
  monthlyContributionCents: number
  desiredMonthlyIncomeCents: number
  inflationRate: string
  conservativeReturnRate: string | null
  baseReturnRate: string | null
  aggressiveReturnRate: string | null
  contributionGrowthRate: string | null
}

export interface WithdrawalStrategySummary {
  mode: string
  fixedMonthlyAmountCents: number | null
  percentageRate: string | null
  liquidationPreset: string
  customLiquidationOrder: string | null
}

export interface SuccessionPlanSummary {
  id: string
  brazilianState: string | null
  estimatedFuneralCostsCents: number
  estimatedLegalFeesCents: number
  additionalLiabilitiesCents: number
}

export interface HeirSummary {
  name: string
  relationship: string
  percentageShare: string
}

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

  const plan = results[0]
  if (!plan) return null

  return {
    currentAge: plan.currentAge,
    retirementAge: plan.retirementAge,
    lifeExpectancy: plan.lifeExpectancy,
    monthlyContributionCents: plan.monthlyContributionCents,
    desiredMonthlyIncomeCents: plan.desiredMonthlyIncomeCents,
    inflationRate: String(plan.inflationRate),
    conservativeReturnRate: plan.conservativeReturnRate != null
      ? String(plan.conservativeReturnRate)
      : null,
    baseReturnRate: plan.baseReturnRate != null ? String(plan.baseReturnRate) : null,
    aggressiveReturnRate: plan.aggressiveReturnRate != null
      ? String(plan.aggressiveReturnRate)
      : null,
    contributionGrowthRate: plan.contributionGrowthRate != null
      ? String(plan.contributionGrowthRate)
      : null,
  } satisfies RetirementPlanSummary
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

  const strategy = results[0]
  if (!strategy) return null

  return {
    mode: strategy.mode,
    fixedMonthlyAmountCents: strategy.fixedMonthlyAmountCents,
    percentageRate: strategy.percentageRate != null ? String(strategy.percentageRate) : null,
    liquidationPreset: strategy.liquidationPreset,
    customLiquidationOrder: strategy.customLiquidationOrder,
  } satisfies WithdrawalStrategySummary
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

  const plan = results[0]
  if (!plan) return null

  return {
    id: plan.id,
    brazilianState: plan.brazilianState,
    estimatedFuneralCostsCents: plan.estimatedFuneralCostsCents,
    estimatedLegalFeesCents: plan.estimatedLegalFeesCents,
    additionalLiabilitiesCents: plan.additionalLiabilitiesCents,
  } satisfies SuccessionPlanSummary
})

/**
 * Returns all heirs for the given succession plan and org.
 */
export const getHeirs = cache(async function getHeirs(
  orgId: string,
  successionPlanId: string
) {
  const db = getDb()
  const results = await db
    .select()
    .from(heirs)
    .where(and(eq(heirs.orgId, orgId), eq(heirs.successionPlanId, successionPlanId)))

  return results.map((heir) => ({
    name: heir.name,
    relationship: heir.relationship,
    percentageShare: String(heir.percentageShare),
  } satisfies HeirSummary))
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

export interface PlanningPortfolioSummary {
  currentPortfolioCents: number
  currentPassiveIncomeCents: number
}

/**
 * Returns the planning summary metrics used across planning pages without
 * materializing full position or income event arrays in the request path.
 */
export const getPlanningPortfolioSummary = cache(async function getPlanningPortfolioSummary(
  orgId: string,
  months: number = 12
): Promise<PlanningPortfolioSummary> {
  return unstable_cache(
    async () => {
      const db = getDb()
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - months)
      const cutoffStr = cutoff.toISOString().split('T')[0]

      const [summary] = await db.execute<{
        current_portfolio_cents: number | null
        current_passive_income_cents: number | null
      }>(sql`
        WITH portfolio_total AS (
          SELECT COALESCE(SUM(current_value_cents), 0)::integer AS current_portfolio_cents
          FROM asset_position_snapshots
          WHERE org_id = ${orgId}
        ),
        income_months AS (
          SELECT
            DATE_TRUNC('month', event_date)::date AS month,
            SUM(COALESCE(total_cents, 0))::integer AS month_total
          FROM portfolio_events
          WHERE org_id = ${orgId}
            AND event_type IN ('dividend', 'interest', 'amortization')
            AND total_cents > 0
            AND event_date >= ${cutoffStr}
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT ${months}
        )
        SELECT
          portfolio_total.current_portfolio_cents,
          COALESCE((
            SELECT ROUND(AVG(month_total))::integer
            FROM income_months
          ), 0)::integer AS current_passive_income_cents
        FROM portfolio_total
      `)

      return {
        currentPortfolioCents: Number(summary?.current_portfolio_cents ?? 0),
        currentPassiveIncomeCents: Number(summary?.current_passive_income_cents ?? 0),
      }
    },
    ['planning-portfolio-summary', orgId, String(months)],
    {
      tags: [
        planningSummaryTag(orgId),
        investmentsTag(orgId),
        pricesTag(orgId),
        incomeEventsTag(orgId, months),
      ],
      revalidate: 300,
    },
  )()
})

/** All saved simulation scenarios for an org, newest first. */
export async function getSimulationScenarios(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(simulationScenarios)
    .where(eq(simulationScenarios.orgId, orgId))
    .orderBy(desc(simulationScenarios.updatedAt))
}
