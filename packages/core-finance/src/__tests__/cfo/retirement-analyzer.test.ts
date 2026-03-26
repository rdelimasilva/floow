import { describe, it, expect } from 'vitest'
import { analyzeRetirement } from '../../cfo/analyzers/retirement'
import type { RetirementAnalyzerInput } from '../../cfo/types'

describe('analyzeRetirement', () => {
  it('returns empty when no plan', () => {
    expect(analyzeRetirement({ plan: null, currentSavingsRate: 0, netWorth: 0 })).toEqual([])
  })

  it('returns warning when savings rate is below required', () => {
    const input: RetirementAnalyzerInput = {
      plan: { targetAge: 55, currentAge: 30, monthlyContribution: 100000, desiredIncome: 1000000 },
      currentSavingsRate: 10,
      netWorth: 5000000,
    }
    expect(analyzeRetirement(input).some((r) => r.category === 'retirement')).toBe(true)
  })

  it('returns positive when on track', () => {
    const input: RetirementAnalyzerInput = {
      plan: { targetAge: 55, currentAge: 30, monthlyContribution: 500000, desiredIncome: 500000 },
      currentSavingsRate: 50,
      netWorth: 50000000,
    }
    const found = analyzeRetirement(input).find((r) => r.type === 'retirement_on_track')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('positive')
  })
})
