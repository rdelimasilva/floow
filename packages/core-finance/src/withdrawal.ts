// ---------------------------------------------------------------------------
// Planning Engine — Withdrawal strategy simulation
// Phase 4 — pure functions, no DB dependency
// Integer cents throughout; Math.round() at every yearly step to prevent drift
// ---------------------------------------------------------------------------

export interface WithdrawalParams {
  initialPortfolioCents: number
  mode: 'fixed' | 'percentage'
  fixedMonthlyWithdrawalCents?: number // used when mode = 'fixed'
  percentageRate?: number // used when mode = 'percentage'; default 0.04 (4% rule)
  annualRealReturnRate: number
  startAge: number
  endAge: number
}

export interface WithdrawalYearPoint {
  year: number
  age: number
  portfolioCents: number
  withdrawalCents: number
  depleted: boolean
}

/**
 * Simulates a withdrawal strategy year-by-year from startAge to endAge.
 *
 * Fixed mode: annual withdrawal = fixedMonthlyWithdrawalCents * 12 (constant amount).
 * Percentage mode: annual withdrawal = portfolio * percentageRate (shrinks with portfolio).
 *
 * After depletion (portfolio <= 0): withdrawalCents = 0, depleted = true.
 * Portfolio is floored at 0 — never goes negative.
 * All monetary values are integer cents (Math.round at each step).
 */
export function simulateWithdrawal(params: WithdrawalParams): WithdrawalYearPoint[] {
  const {
    initialPortfolioCents,
    mode,
    fixedMonthlyWithdrawalCents = 0,
    percentageRate = 0.04,
    annualRealReturnRate,
    startAge,
    endAge,
  } = params

  const points: WithdrawalYearPoint[] = []
  let portfolioCents = initialPortfolioCents
  const currentYear = new Date().getFullYear()

  for (let age = startAge; age <= endAge; age++) {
    const depleted = portfolioCents <= 0

    const withdrawalCents =
      depleted
        ? 0
        : mode === 'fixed'
          ? fixedMonthlyWithdrawalCents * 12
          : Math.round(portfolioCents * percentageRate)

    points.push({
      year: currentYear + (age - startAge),
      age,
      portfolioCents: Math.max(0, portfolioCents),
      withdrawalCents,
      depleted,
    })

    if (!depleted) {
      portfolioCents = Math.round(portfolioCents * (1 + annualRealReturnRate))
      portfolioCents -= withdrawalCents
    }
  }

  return points
}
