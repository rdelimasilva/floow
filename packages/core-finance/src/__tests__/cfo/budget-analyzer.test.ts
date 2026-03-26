import { describe, it, expect } from 'vitest'
import { analyzeBudget } from '../../cfo/analyzers/budget'
import type { BudgetAnalyzerInput } from '../../cfo/types'

describe('analyzeBudget', () => {
  it('returns empty array when no goals', () => {
    expect(analyzeBudget({ goals: [], historicalUsage: [] })).toEqual([])
  })

  it('returns warning when budget is exceeded (100-120%)', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Alimentação', limit: 50000, spent: 55000, period: 'monthly' }],
      historicalUsage: [],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_exceeded')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('warning')
  })

  it('returns critical when spending > 120% of budget', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Delivery', limit: 30000, spent: 37000, period: 'monthly' }],
      historicalUsage: [],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_exceeded')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns info when budget has consistent slack (<60% for 3 months)', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Transporte', limit: 50000, spent: 20000, period: 'monthly' }],
      historicalUsage: [
        { category: 'Transporte', month: '2026-01', spent: 25000 },
        { category: 'Transporte', month: '2026-02', spent: 22000 },
        { category: 'Transporte', month: '2026-03', spent: 20000 },
      ],
    }
    const results = analyzeBudget(input)
    const found = results.find((r) => r.type === 'budget_consistent_slack')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('info')
  })

  it('does not flag slack with only 2 months of history', () => {
    const input: BudgetAnalyzerInput = {
      goals: [{ category: 'Transporte', limit: 50000, spent: 20000, period: 'monthly' }],
      historicalUsage: [
        { category: 'Transporte', month: '2026-02', spent: 22000 },
        { category: 'Transporte', month: '2026-03', spent: 20000 },
      ],
    }
    const results = analyzeBudget(input)
    expect(results.find((r) => r.type === 'budget_consistent_slack')).toBeUndefined()
  })
})
