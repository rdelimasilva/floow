import { describe, it, expect } from 'vitest'
import {
  simulateRetirementScenario,
  calculateFI,
  SCENARIO_PRESETS,
} from '../simulation'

describe('simulateRetirementScenario', () => {
  const baseParams = {
    currentPortfolioCents: 50_000_000, // R$500k
    monthlyContributionCents: 500_000, // R$5k/mo
    currentAge: 30,
    retirementAge: 65,
    lifeExpectancy: 85,
    desiredMonthlyIncomeCents: 1_000_000, // R$10k/mo
    annualRealReturnRate: 0.06,
    annualContributionGrowthRate: 0.03,
  }

  it('returns correct number of data points (lifeExpectancy - currentAge + 1)', () => {
    const points = simulateRetirementScenario(baseParams)
    expect(points.length).toBe(85 - 30 + 1) // 56 points
  })

  it('first point has portfolioCents equal to currentPortfolioCents', () => {
    const points = simulateRetirementScenario(baseParams)
    expect(points[0].portfolioCents).toBe(50_000_000)
  })

  it('first point has age equal to currentAge', () => {
    const points = simulateRetirementScenario(baseParams)
    expect(points[0].age).toBe(30)
  })

  it('last point has age equal to lifeExpectancy', () => {
    const points = simulateRetirementScenario(baseParams)
    expect(points[points.length - 1].age).toBe(85)
  })

  it('portfolio grows during accumulation phase (age < retirementAge)', () => {
    const points = simulateRetirementScenario(baseParams)
    // Age 30 (index 0) to age 64 (index 34) — accumulation
    const atAge30 = points[0].portfolioCents
    const atAge64 = points[34].portfolioCents
    expect(atAge64).toBeGreaterThan(atAge30)
  })

  it('portfolio can deplete during withdrawal phase when income exceeds returns', () => {
    const params = {
      ...baseParams,
      currentPortfolioCents: 1_000_000, // Very small portfolio R$10k
      monthlyContributionCents: 0,
      currentAge: 60,
      retirementAge: 61, // almost immediate retirement
      desiredMonthlyIncomeCents: 500_000, // R$5k/mo — too much for R$10k portfolio
      annualRealReturnRate: 0.02,
    }
    const points = simulateRetirementScenario(params)
    const lastPoint = points[points.length - 1]
    expect(lastPoint.portfolioCents).toBe(0)
  })

  it('portfolio floor is 0 (never negative)', () => {
    const params = {
      ...baseParams,
      currentPortfolioCents: 1_000_000,
      monthlyContributionCents: 0,
      currentAge: 60,
      retirementAge: 61,
      desiredMonthlyIncomeCents: 2_000_000, // R$20k/mo — way too much
      annualRealReturnRate: 0.01,
    }
    const points = simulateRetirementScenario(params)
    const negativePoints = points.filter((p) => p.portfolioCents < 0)
    expect(negativePoints.length).toBe(0)
  })

  it('all portfolioCents values are integers (Math.round applied)', () => {
    const points = simulateRetirementScenario(baseParams)
    for (const p of points) {
      expect(Number.isInteger(p.portfolioCents)).toBe(true)
    }
  })

  it('three scenarios with different rates produce three different final portfolio values', () => {
    const conservative = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: SCENARIO_PRESETS.conservative.annualRealReturnRate,
      annualContributionGrowthRate: SCENARIO_PRESETS.conservative.annualContributionGrowthRate,
    })
    const base = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: SCENARIO_PRESETS.base.annualRealReturnRate,
      annualContributionGrowthRate: SCENARIO_PRESETS.base.annualContributionGrowthRate,
    })
    const aggressive = simulateRetirementScenario({
      ...baseParams,
      annualRealReturnRate: SCENARIO_PRESETS.aggressive.annualRealReturnRate,
      annualContributionGrowthRate: SCENARIO_PRESETS.aggressive.annualContributionGrowthRate,
    })
    const lastConservative = conservative[conservative.length - 1].portfolioCents
    const lastBase = base[base.length - 1].portfolioCents
    const lastAggressive = aggressive[aggressive.length - 1].portfolioCents
    expect(lastAggressive).toBeGreaterThan(lastBase)
    expect(lastBase).toBeGreaterThan(lastConservative)
  })
})

describe('calculateFI', () => {
  const baseParams = {
    currentPortfolioCents: 100_000_000, // R$1M
    monthlyContributionCents: 500_000,  // R$5k/mo
    targetMonthlyPassiveIncomeCents: 1_000_000, // R$10k/mo
    annualRealReturnRate: 0.06,
    currentAge: 30,
  }

  it('returns correct fiNumberCents (targetAnnualIncome / safeWithdrawalRate)', () => {
    const result = calculateFI(baseParams)
    // FI number = (R$10k * 12) / 0.06 = R$2M = 200_000_000 cents
    expect(result.fiNumberCents).toBe(200_000_000)
  })

  it('returns finite fiYear when portfolio will reach FI number', () => {
    const result = calculateFI(baseParams)
    expect(result.fiYear).not.toBeNull()
    expect(typeof result.fiYear).toBe('number')
  })

  it('returns non-null yearsToFI when FI is reachable', () => {
    const result = calculateFI(baseParams)
    expect(result.yearsToFI).not.toBeNull()
    expect(result.yearsToFI).toBeGreaterThan(0)
  })

  it('returns null fiYear when FI is unreachable (tiny portfolio, huge target)', () => {
    const result = calculateFI({
      currentPortfolioCents: 100_000,  // R$1k
      monthlyContributionCents: 1_000, // R$10/mo
      targetMonthlyPassiveIncomeCents: 100_000_000, // R$1M/mo — impossible
      annualRealReturnRate: 0.06,
      currentAge: 30,
      maxSearchYears: 60,
    })
    expect(result.fiYear).toBeNull()
    expect(result.yearsToFI).toBeNull()
  })

  it('fiNumberCents is always positive', () => {
    const result = calculateFI(baseParams)
    expect(result.fiNumberCents).toBeGreaterThan(0)
  })

  it('portfolio already at FI number returns yearsToFI = 0', () => {
    const result = calculateFI({
      ...baseParams,
      currentPortfolioCents: 200_000_000, // Already at FI number
    })
    expect(result.fiYear).not.toBeNull()
    expect(result.yearsToFI).toBe(0)
  })
})

describe('SCENARIO_PRESETS', () => {
  it('has conservative preset with expected rates', () => {
    expect(SCENARIO_PRESETS.conservative.annualRealReturnRate).toBe(0.04)
    expect(SCENARIO_PRESETS.conservative.annualContributionGrowthRate).toBe(0.02)
  })

  it('has base preset with expected rates', () => {
    expect(SCENARIO_PRESETS.base.annualRealReturnRate).toBe(0.06)
    expect(SCENARIO_PRESETS.base.annualContributionGrowthRate).toBe(0.03)
  })

  it('has aggressive preset with expected rates', () => {
    expect(SCENARIO_PRESETS.aggressive.annualRealReturnRate).toBe(0.09)
    expect(SCENARIO_PRESETS.aggressive.annualContributionGrowthRate).toBe(0.04)
  })
})
