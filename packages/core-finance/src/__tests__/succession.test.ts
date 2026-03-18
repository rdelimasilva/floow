import { describe, it, expect } from 'vitest'
import {
  calcItcmd,
  calcLiquidityGap,
  ITCMD_RATES_BY_STATE,
  validateHeirPercentages,
} from '../succession'

describe('calcItcmd', () => {
  it('returns correct amount for SP (4%)', () => {
    // 4% of R$1M (100_000_000 cents) = R$40k (4_000_000 cents)
    const result = calcItcmd(100_000_000, 'SP')
    expect(result).toBe(4_000_000)
  })

  it('returns correct amount for BA (8%)', () => {
    // 8% of R$1M (100_000_000 cents) = R$80k (8_000_000 cents)
    const result = calcItcmd(100_000_000, 'BA')
    expect(result).toBe(8_000_000)
  })

  it('falls back to 5% for unknown state', () => {
    // 5% of R$1M = R$50k (5_000_000 cents)
    const result = calcItcmd(100_000_000, 'XX')
    expect(result).toBe(5_000_000)
  })

  it('is case-insensitive (lowercase state code)', () => {
    const upper = calcItcmd(100_000_000, 'SP')
    const lower = calcItcmd(100_000_000, 'sp')
    expect(upper).toBe(lower)
  })

  it('returns integer (Math.round applied)', () => {
    const result = calcItcmd(100_000_001, 'SP') // odd number to trigger rounding
    expect(Number.isInteger(result)).toBe(true)
  })

  it('ITCMD_RATES_BY_STATE has all 27 Brazilian states', () => {
    const states = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
    ]
    for (const state of states) {
      expect(ITCMD_RATES_BY_STATE[state]).toBeDefined()
      expect(ITCMD_RATES_BY_STATE[state]).toBeGreaterThan(0)
    }
    expect(Object.keys(ITCMD_RATES_BY_STATE).length).toBe(27)
  })
})

describe('calcLiquidityGap', () => {
  const baseParams = {
    totalEstateCents: 200_000_000,  // R$2M estate
    liquidAssetsCents: 100_000_000, // R$1M liquid
    brazilianState: 'SP',
    // SP ITCMD = 4% of R$2M = R$80k = 8_000_000 cents
    // defaults: funeral R$15k = 1_500_000, legal R$5k = 500_000
    // required = 8_000_000 + 1_500_000 + 500_000 = 10_000_000
    // liquid R$1M = 100_000_000 >> required — gap = 0
  }

  it('returns 0 liquidityGapCents when liquid assets cover all required costs', () => {
    const result = calcLiquidityGap(baseParams)
    expect(result.liquidityGapCents).toBe(0)
  })

  it('returns positive liquidityGapCents when liquid assets insufficient', () => {
    const params = {
      ...baseParams,
      liquidAssetsCents: 1_000_000, // R$10k — not enough to cover R$100k+ costs
    }
    const result = calcLiquidityGap(params)
    expect(result.liquidityGapCents).toBeGreaterThan(0)
  })

  it('includes ITCMD in required liquidity calculation', () => {
    const result = calcLiquidityGap(baseParams)
    // SP 4% of R$2M = R$80k = 8_000_000 cents
    expect(result.itcmdTotalCents).toBe(8_000_000)
  })

  it('includes funeral + legal + additional in required liquidity', () => {
    const params = {
      totalEstateCents: 0, // No ITCMD
      liquidAssetsCents: 0,
      brazilianState: 'SP',
      estimatedFuneralCostsCents: 2_000_000,  // R$20k
      estimatedLegalFeesCents: 1_000_000,     // R$10k
      additionalLiabilitiesCents: 500_000,    // R$5k
    }
    const result = calcLiquidityGap(params)
    // required = 0 + 2_000_000 + 1_000_000 + 500_000 = 3_500_000
    expect(result.requiredLiquidityCents).toBe(3_500_000)
  })

  it('uses default funeral and legal costs when not provided', () => {
    const params = {
      totalEstateCents: 0,
      liquidAssetsCents: 0,
      brazilianState: 'SP',
    }
    const result = calcLiquidityGap(params)
    // defaults: funeral 1_500_000 + legal 500_000 = 2_000_000
    expect(result.requiredLiquidityCents).toBe(2_000_000)
  })

  it('liquidityGapCents is never negative (floor at 0)', () => {
    const result = calcLiquidityGap(baseParams) // liquid >> required
    expect(result.liquidityGapCents).toBeGreaterThanOrEqual(0)
  })
})

describe('validateHeirPercentages', () => {
  it('returns true when shares sum to exactly 100', () => {
    expect(validateHeirPercentages([50, 50])).toBe(true)
  })

  it('returns true for single heir with 100%', () => {
    expect(validateHeirPercentages([100])).toBe(true)
  })

  it('returns true for 3 heirs summing to 100', () => {
    expect(validateHeirPercentages([33.33, 33.33, 33.34])).toBe(true)
  })

  it('returns false when shares sum to more than 100', () => {
    expect(validateHeirPercentages([60, 50])).toBe(false)
  })

  it('returns false when shares sum to less than 100', () => {
    expect(validateHeirPercentages([40, 40])).toBe(false)
  })

  it('returns false for empty heir list', () => {
    expect(validateHeirPercentages([])).toBe(false)
  })

  it('handles floating-point shares that sum to 100 within rounding', () => {
    // 3 equal shares: 33.33 * 3 = 99.99 — floating point trap
    // Should pass because Math.round(99.99) = 100
    expect(validateHeirPercentages([33.33, 33.33, 33.34])).toBe(true)
  })
})
