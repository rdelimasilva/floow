import { describe, it, expect } from 'vitest'
import { simulateWithdrawal } from '../withdrawal'

describe('simulateWithdrawal - fixed mode', () => {
  const fixedParams = {
    initialPortfolioCents: 120_000_000, // R$1.2M
    mode: 'fixed' as const,
    fixedMonthlyWithdrawalCents: 1_000_000, // R$10k/mo
    annualRealReturnRate: 0.04,
    startAge: 65,
    endAge: 95,
  }

  it('returns correct number of points (endAge - startAge + 1)', () => {
    const points = simulateWithdrawal(fixedParams)
    expect(points.length).toBe(95 - 65 + 1) // 31 points
  })

  it('first point has portfolioCents equal to initialPortfolioCents', () => {
    const points = simulateWithdrawal(fixedParams)
    expect(points[0].portfolioCents).toBe(120_000_000)
  })

  it('first point has age equal to startAge', () => {
    const points = simulateWithdrawal(fixedParams)
    expect(points[0].age).toBe(65)
  })

  it('portfolio depletes when withdrawal exceeds returns; depleted flag set', () => {
    const params = {
      initialPortfolioCents: 5_000_000, // R$50k — will deplete
      mode: 'fixed' as const,
      fixedMonthlyWithdrawalCents: 500_000, // R$5k/mo = R$60k/yr — exceeds 4%
      annualRealReturnRate: 0.04,
      startAge: 65,
      endAge: 90,
    }
    const points = simulateWithdrawal(params)
    const depletedPoints = points.filter((p) => p.depleted)
    expect(depletedPoints.length).toBeGreaterThan(0)
  })

  it('portfolioCents floor at 0 after depletion', () => {
    const params = {
      initialPortfolioCents: 2_000_000, // R$20k — depletes quickly
      mode: 'fixed' as const,
      fixedMonthlyWithdrawalCents: 500_000, // R$5k/mo
      annualRealReturnRate: 0.02,
      startAge: 65,
      endAge: 90,
    }
    const points = simulateWithdrawal(params)
    const negativePoints = points.filter((p) => p.portfolioCents < 0)
    expect(negativePoints.length).toBe(0)
  })

  it('withdrawalCents is 0 after depletion', () => {
    const params = {
      initialPortfolioCents: 1_000_000, // R$10k — depletes very quickly
      mode: 'fixed' as const,
      fixedMonthlyWithdrawalCents: 500_000, // R$5k/mo
      annualRealReturnRate: 0.02,
      startAge: 65,
      endAge: 90,
    }
    const points = simulateWithdrawal(params)
    const depletedPoints = points.filter((p) => p.depleted)
    for (const p of depletedPoints) {
      expect(p.withdrawalCents).toBe(0)
    }
  })

  it('all values are integers (Math.round applied)', () => {
    const points = simulateWithdrawal(fixedParams)
    for (const p of points) {
      expect(Number.isInteger(p.portfolioCents)).toBe(true)
      expect(Number.isInteger(p.withdrawalCents)).toBe(true)
    }
  })
})

describe('simulateWithdrawal - percentage mode', () => {
  const percentageParams = {
    initialPortfolioCents: 120_000_000, // R$1.2M
    mode: 'percentage' as const,
    percentageRate: 0.04, // 4% rule
    annualRealReturnRate: 0.06, // Return exceeds withdrawal — sustainable
    startAge: 65,
    endAge: 100,
  }

  it('percentage mode: portfolio remains positive (sustainable withdrawal at 4% with 6% return)', () => {
    const points = simulateWithdrawal(percentageParams)
    const lastPoint = points[points.length - 1]
    expect(lastPoint.portfolioCents).toBeGreaterThan(0)
    expect(lastPoint.depleted).toBe(false)
  })

  it('percentage mode: no depleted points when return > withdrawal rate', () => {
    const points = simulateWithdrawal(percentageParams)
    const depletedPoints = points.filter((p) => p.depleted)
    expect(depletedPoints.length).toBe(0)
  })

  it('percentage mode: withdrawal amount changes each year (proportional to portfolio)', () => {
    const points = simulateWithdrawal(percentageParams)
    // Since portfolio grows, withdrawals should also grow
    expect(points[1].withdrawalCents).not.toBe(points[10].withdrawalCents)
  })

  it('percentage mode: all values are integers', () => {
    const points = simulateWithdrawal(percentageParams)
    for (const p of points) {
      expect(Number.isInteger(p.portfolioCents)).toBe(true)
      expect(Number.isInteger(p.withdrawalCents)).toBe(true)
    }
  })
})
