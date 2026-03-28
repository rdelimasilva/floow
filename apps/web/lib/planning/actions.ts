'use server'

import { revalidatePath } from 'next/cache'
import {
  getDb,
  retirementPlans,
  withdrawalStrategies,
  successionPlans,
  heirs,
} from '@floow/db'
import { eq } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import {
  retirementPlanSchema,
  withdrawalStrategySchema,
  successionPlanSchema,
  heirSchema,
  type RetirementPlanInput,
  type WithdrawalStrategyInput,
  type SuccessionPlanInput,
  type HeirInput,
} from '@floow/shared'
import { validateHeirPercentages } from '@floow/core-finance'
import { planningSummaryTag, planningTag, invalidateTag } from '@/lib/cache-tags'

/**
 * Upserts the retirement plan for the current org.
 * One plan per org (uniqueIndex on orgId enables onConflictDoUpdate).
 */
export async function saveRetirementPlan(input: RetirementPlanInput) {
  const validated = retirementPlanSchema.parse(input)
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .insert(retirementPlans)
    .values({
      orgId,
      currentAge: validated.currentAge,
      retirementAge: validated.retirementAge,
      lifeExpectancy: validated.lifeExpectancy ?? 85,
      monthlyContributionCents: validated.monthlyContributionCents,
      desiredMonthlyIncomeCents: validated.desiredMonthlyIncomeCents,
      inflationRate: String(validated.inflationRate ?? 0.04),
      conservativeReturnRate: validated.conservativeReturnRate != null
        ? String(validated.conservativeReturnRate)
        : null,
      baseReturnRate: validated.baseReturnRate != null
        ? String(validated.baseReturnRate)
        : null,
      aggressiveReturnRate: validated.aggressiveReturnRate != null
        ? String(validated.aggressiveReturnRate)
        : null,
      contributionGrowthRate: validated.contributionGrowthRate != null
        ? String(validated.contributionGrowthRate)
        : null,
    })
    .onConflictDoUpdate({
      target: retirementPlans.orgId,
      set: {
        currentAge: validated.currentAge,
        retirementAge: validated.retirementAge,
        lifeExpectancy: validated.lifeExpectancy ?? 85,
        monthlyContributionCents: validated.monthlyContributionCents,
        desiredMonthlyIncomeCents: validated.desiredMonthlyIncomeCents,
        inflationRate: String(validated.inflationRate ?? 0.04),
        conservativeReturnRate: validated.conservativeReturnRate != null
          ? String(validated.conservativeReturnRate)
          : null,
        baseReturnRate: validated.baseReturnRate != null
          ? String(validated.baseReturnRate)
          : null,
        aggressiveReturnRate: validated.aggressiveReturnRate != null
          ? String(validated.aggressiveReturnRate)
          : null,
        contributionGrowthRate: validated.contributionGrowthRate != null
          ? String(validated.contributionGrowthRate)
          : null,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/planning')
  revalidatePath('/planning/simulation')
  invalidateTag(planningTag(orgId))
  invalidateTag(planningSummaryTag(orgId))
}

/**
 * Upserts the withdrawal strategy for the current org.
 * One strategy per org (uniqueIndex on orgId enables onConflictDoUpdate).
 */
export async function saveWithdrawalStrategy(input: WithdrawalStrategyInput) {
  const validated = withdrawalStrategySchema.parse(input)
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .insert(withdrawalStrategies)
    .values({
      orgId,
      mode: validated.mode,
      fixedMonthlyAmountCents: validated.fixedMonthlyAmountCents ?? null,
      percentageRate: validated.percentageRate != null ? String(validated.percentageRate) : null,
      liquidationPreset: validated.liquidationPreset,
      customLiquidationOrder: validated.customLiquidationOrder
        ? JSON.stringify(validated.customLiquidationOrder)
        : null,
    })
    .onConflictDoUpdate({
      target: withdrawalStrategies.orgId,
      set: {
        mode: validated.mode,
        fixedMonthlyAmountCents: validated.fixedMonthlyAmountCents ?? null,
        percentageRate: validated.percentageRate != null
          ? String(validated.percentageRate)
          : null,
        liquidationPreset: validated.liquidationPreset,
        customLiquidationOrder: validated.customLiquidationOrder
          ? JSON.stringify(validated.customLiquidationOrder)
          : null,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/planning')
  revalidatePath('/planning/withdrawal')
  invalidateTag(planningTag(orgId))
}

/**
 * Upserts the succession plan and replaces all heirs atomically.
 * Validates that heir percentages sum to 100.
 */
export async function saveSuccessionPlan(input: {
  plan: SuccessionPlanInput
  heirs: HeirInput[]
}) {
  const validatedPlan = successionPlanSchema.parse(input.plan)
  const validatedHeirs = input.heirs.map((h) => heirSchema.parse(h))

  if (validatedHeirs.length > 0 && !validateHeirPercentages(validatedHeirs.map((h) => h.percentageShare))) {
    throw new Error('As porcentagens dos herdeiros devem somar 100%')
  }

  const orgId = await getOrgId()
  const db = getDb()

  await db.transaction(async (tx) => {
    // Upsert succession plan
    const [plan] = await tx
      .insert(successionPlans)
      .values({
        orgId,
        brazilianState: validatedPlan.brazilianState ?? null,
        estimatedFuneralCostsCents:
          validatedPlan.estimatedFuneralCostsCents ?? 1500000,
        estimatedLegalFeesCents:
          validatedPlan.estimatedLegalFeesCents ?? 500000,
        additionalLiabilitiesCents:
          validatedPlan.additionalLiabilitiesCents ?? 0,
      })
      .onConflictDoUpdate({
        target: successionPlans.orgId,
        set: {
          brazilianState: validatedPlan.brazilianState ?? null,
          estimatedFuneralCostsCents:
            validatedPlan.estimatedFuneralCostsCents ?? 1500000,
          estimatedLegalFeesCents:
            validatedPlan.estimatedLegalFeesCents ?? 500000,
          additionalLiabilitiesCents:
            validatedPlan.additionalLiabilitiesCents ?? 0,
          updatedAt: new Date(),
        },
      })
      .returning()

    // Delete existing heirs for this plan and re-insert
    await tx.delete(heirs).where(eq(heirs.successionPlanId, plan.id))

    if (validatedHeirs.length > 0) {
      await tx.insert(heirs).values(
        validatedHeirs.map((heir) => ({
          successionPlanId: plan.id,
          orgId,
          name: heir.name,
          relationship: heir.relationship,
          percentageShare: String(heir.percentageShare),
        }))
      )
    }
  })

  revalidatePath('/planning')
  revalidatePath('/planning/succession')
  invalidateTag(planningTag(orgId))
}
