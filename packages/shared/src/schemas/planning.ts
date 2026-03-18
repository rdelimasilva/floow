import { z } from 'zod'

// ---------------------------------------------------------------------------
// Retirement Plan Schema
// ---------------------------------------------------------------------------

export const retirementPlanSchema = z.object({
  currentAge: z.number().int().min(18).max(100),
  retirementAge: z.number().int().min(20).max(100),
  lifeExpectancy: z.number().int().min(50).max(120).default(85),
  monthlyContributionCents: z.number().int().min(0),
  desiredMonthlyIncomeCents: z.number().int().min(0),
  inflationRate: z.number().min(0).max(0.5).optional().default(0.04),
  conservativeReturnRate: z.number().min(0).max(0.5).optional(),
  baseReturnRate: z.number().min(0).max(0.5).optional(),
  aggressiveReturnRate: z.number().min(0).max(0.5).optional(),
  contributionGrowthRate: z.number().min(0).max(0.3).optional(),
})

export type RetirementPlanInput = z.infer<typeof retirementPlanSchema>

// ---------------------------------------------------------------------------
// Withdrawal Strategy Schema
// ---------------------------------------------------------------------------

export const withdrawalStrategySchema = z.object({
  mode: z.enum(['fixed', 'percentage']),
  fixedMonthlyAmountCents: z.number().int().optional(),
  percentageRate: z.number().min(0.01).max(0.2).optional(),
  liquidationPreset: z.string().default('income_preserving'),
  customLiquidationOrder: z.array(z.string()).optional(),
})

export type WithdrawalStrategyInput = z.infer<typeof withdrawalStrategySchema>

// ---------------------------------------------------------------------------
// Succession Plan Schema
// ---------------------------------------------------------------------------

export const successionPlanSchema = z.object({
  brazilianState: z.string().length(2).optional(),
  estimatedFuneralCostsCents: z.number().int().optional().default(1500000),
  estimatedLegalFeesCents: z.number().int().optional().default(500000),
  additionalLiabilitiesCents: z.number().int().optional().default(0),
})

export type SuccessionPlanInput = z.infer<typeof successionPlanSchema>

// ---------------------------------------------------------------------------
// Heir Schema
// ---------------------------------------------------------------------------

export const heirSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().min(1).max(100),
  percentageShare: z.number().min(0).max(100),
})

export type HeirInput = z.infer<typeof heirSchema>
