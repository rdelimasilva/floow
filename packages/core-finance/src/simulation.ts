// ---------------------------------------------------------------------------
// Planning Engine — Retirement simulation and FI (Financial Independence) calculator
// Phase 4 — pure functions, no DB dependency
// Integer cents throughout; Math.round() at every yearly step to prevent drift
// ---------------------------------------------------------------------------

export interface RetirementScenarioParams {
  currentPortfolioCents: number // integer cents
  monthlyContributionCents: number // integer cents
  currentAge: number
  retirementAge: number
  lifeExpectancy: number
  desiredMonthlyIncomeCents: number // in today's money (real terms)
  annualRealReturnRate: number // e.g. 0.06 for 6% real
  annualContributionGrowthRate: number // e.g. 0.03 for 3% real growth
}

export interface RetirementYearPoint {
  year: number
  age: number
  portfolioCents: number // integer cents, rounded each step
}

/**
 * Simulates a retirement scenario year-by-year from currentAge to lifeExpectancy.
 *
 * Accumulation phase (age < retirementAge): portfolio compounds + contributions added.
 * Withdrawal phase (age >= retirementAge): portfolio compounds - desired income withdrawn.
 * Portfolio is floored at 0 — never goes negative.
 *
 * All values computed in real terms (today's money).
 */
export function simulateRetirementScenario(
  params: RetirementScenarioParams
): RetirementYearPoint[] {
  const {
    currentPortfolioCents,
    monthlyContributionCents,
    currentAge,
    retirementAge,
    lifeExpectancy,
    desiredMonthlyIncomeCents,
    annualRealReturnRate,
    annualContributionGrowthRate,
  } = params

  const points: RetirementYearPoint[] = []
  let portfolioCents = currentPortfolioCents
  let annualContributionCents = monthlyContributionCents * 12
  const currentYear = new Date().getFullYear()

  for (let age = currentAge; age <= lifeExpectancy; age++) {
    points.push({ year: currentYear + (age - currentAge), age, portfolioCents })

    if (age < retirementAge) {
      // Accumulation phase: apply growth + add contributions
      portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
      portfolioCents += Math.round(annualContributionCents)
      annualContributionCents = Math.round(
        annualContributionCents * (1 + annualContributionGrowthRate)
      )
    } else {
      // Withdrawal phase: apply growth, subtract desired income
      portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
      portfolioCents -= desiredMonthlyIncomeCents * 12
      if (portfolioCents < 0) portfolioCents = 0
    }
  }

  return points
}

// ---------------------------------------------------------------------------
// FI (Financial Independence) Calculator
// ---------------------------------------------------------------------------

export interface FIParams {
  currentPortfolioCents: number
  monthlyContributionCents: number
  targetMonthlyPassiveIncomeCents: number
  annualRealReturnRate: number
  currentAge: number
  maxSearchYears?: number // default 60
}

export interface FIResult {
  fiNumberCents: number // Required portfolio size to sustain target income forever
  fiYear: number | null // Year when portfolio crosses FI number (null if unreachable)
  yearsToFI: number | null
}

/**
 * Calculates the Financial Independence number and the year the portfolio crosses it.
 *
 * FI Number = (target monthly income * 12) / safe withdrawal rate
 * The safe withdrawal rate is the annualRealReturnRate (or 4% if rate is 0).
 *
 * Returns null fiYear/yearsToFI if FI is not reachable within maxSearchYears.
 */
export function calculateFI(params: FIParams): FIResult {
  const {
    currentPortfolioCents,
    monthlyContributionCents,
    targetMonthlyPassiveIncomeCents,
    annualRealReturnRate,
    currentAge: _currentAge,
    maxSearchYears = 60,
  } = params

  // FI Number = annual target / rate (4% rule: rate = 0.04)
  const safeWithdrawalRate = annualRealReturnRate > 0 ? annualRealReturnRate : 0.04
  const fiNumberCents = Math.round(
    (targetMonthlyPassiveIncomeCents * 12) / safeWithdrawalRate
  )

  let portfolioCents = currentPortfolioCents
  const currentYear = new Date().getFullYear()

  for (let yearsElapsed = 0; yearsElapsed <= maxSearchYears; yearsElapsed++) {
    if (portfolioCents >= fiNumberCents) {
      return {
        fiNumberCents,
        fiYear: currentYear + yearsElapsed,
        yearsToFI: yearsElapsed,
      }
    }
    portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
    portfolioCents += monthlyContributionCents * 12
  }

  return { fiNumberCents, fiYear: null, yearsToFI: null }
}

// ---------------------------------------------------------------------------
// Scenario Presets
// Based on Brazilian market context — see 04-RESEARCH.md for rationale
// ---------------------------------------------------------------------------

export interface ScenarioPreset {
  annualRealReturnRate: number
  annualContributionGrowthRate: number
}

/**
 * Scenario presets for Brazilian market context (real terms, IPCA-adjusted).
 * Conservative: CDI-like returns (~4% real); Base: mixed portfolio (~6% real);
 * Aggressive: equity-heavy (~9% real, IBOV historical).
 */
export const SCENARIO_PRESETS: Record<string, ScenarioPreset> = {
  conservative: { annualRealReturnRate: 0.04, annualContributionGrowthRate: 0.02 },
  base: { annualRealReturnRate: 0.06, annualContributionGrowthRate: 0.03 },
  aggressive: { annualRealReturnRate: 0.09, annualContributionGrowthRate: 0.04 },
}
