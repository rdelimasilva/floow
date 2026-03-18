// ---------------------------------------------------------------------------
// Planning Engine — Succession and inheritance planning (Brazilian market)
// Phase 4 — pure functions, no DB dependency
//
// DISCLAIMER: ITCMD rates are approximate and based on 2024-2025 state laws.
// Rates may change annually. Always consult a qualified tax advisor (contador
// or advogado tributarista) for accurate estate planning.
// Source: Receita Estadual / state revenue secretariats; rates represent
// maximum marginal aliquot (many states use progressive tables — flat max
// rate is used here for conservative estimation).
// ---------------------------------------------------------------------------

/**
 * ITCMD (Imposto de Transmissão Causa Mortis e Doação) rates by Brazilian state.
 * Maximum marginal flat rate as of 2024-2025.
 * 26 states + DF = 27 entries total.
 */
export const ITCMD_RATES_BY_STATE: Record<string, number> = {
  AC: 0.04, AL: 0.04, AP: 0.04, AM: 0.04, BA: 0.08,
  CE: 0.08, DF: 0.06, ES: 0.04, GO: 0.04, MA: 0.04,
  MT: 0.08, MS: 0.06, MG: 0.05, PA: 0.04, PB: 0.08,
  PR: 0.04, PE: 0.08, PI: 0.04, RJ: 0.08, RN: 0.06,
  RS: 0.06, RO: 0.04, RR: 0.04, SC: 0.08, SP: 0.04,
  SE: 0.08, TO: 0.04,
}

/**
 * Calculates the approximate ITCMD tax for a given estate value and Brazilian state.
 * Falls back to 5% if the state is not found in the table.
 * Returns integer cents (Math.round applied).
 */
export function calcItcmd(estateCents: number, state: string): number {
  const rate = ITCMD_RATES_BY_STATE[state.toUpperCase()] ?? 0.05
  return Math.round(estateCents * rate)
}

// ---------------------------------------------------------------------------
// Liquidity Gap Calculation
// ---------------------------------------------------------------------------

export interface LiquidityGapParams {
  totalEstateCents: number
  liquidAssetsCents: number // from computeSnapshot() liquid assets
  brazilianState: string
  estimatedFuneralCostsCents?: number // default 1_500_000 (R$15k)
  estimatedLegalFeesCents?: number // default 500_000 (R$5k)
  additionalLiabilitiesCents?: number // default 0
}

export interface LiquidityGapResult {
  requiredLiquidityCents: number // ITCMD + funeral + legal + additional
  liquidityGapCents: number // max(0, required - liquid) — 0 if well covered
  itcmdTotalCents: number // ITCMD portion of required liquidity
}

/**
 * Calculates the liquidity gap for estate settlement.
 *
 * Required liquidity = ITCMD + funeral costs + legal fees + additional liabilities.
 * Gap = max(0, required - liquid assets).
 *
 * A positive gap means liquid assets are insufficient to cover settlement costs —
 * the estate may require asset sales or loans.
 */
export function calcLiquidityGap(params: LiquidityGapParams): LiquidityGapResult {
  const {
    totalEstateCents,
    liquidAssetsCents,
    brazilianState,
    estimatedFuneralCostsCents = 1_500_000,
    estimatedLegalFeesCents = 500_000,
    additionalLiabilitiesCents = 0,
  } = params

  const itcmdTotalCents = calcItcmd(totalEstateCents, brazilianState)
  const requiredLiquidityCents =
    itcmdTotalCents + estimatedFuneralCostsCents + estimatedLegalFeesCents + additionalLiabilitiesCents
  const liquidityGapCents = Math.max(0, requiredLiquidityCents - liquidAssetsCents)

  return { requiredLiquidityCents, liquidityGapCents, itcmdTotalCents }
}

// ---------------------------------------------------------------------------
// Heir Percentage Validation
// ---------------------------------------------------------------------------

/**
 * Validates that heir percentage shares sum to exactly 100.
 * Uses Math.round to handle floating-point precision (e.g., 33.33 * 3 = 99.99 rounds to 100).
 * Returns false for empty arrays (must have at least one heir).
 */
export function validateHeirPercentages(shares: number[]): boolean {
  if (shares.length === 0) return false
  const total = shares.reduce((sum, s) => sum + s, 0)
  return Math.round(total) === 100
}
