import { describe, it, expect } from 'vitest'
import { analyzeBehavior } from '../../cfo/analyzers/behavior'
import type { BehaviorAnalyzerInput } from '../../cfo/types'

describe('analyzeBehavior', () => {
  it('returns empty when no transactions', () => {
    expect(analyzeBehavior({ transactions: [], averageTransactionAmount: { current: 0, previous: 0 } })).toEqual([])
  })

  it('detects weekend spending dominance (>40% on weekends)', () => {
    const transactions = [
      { date: '2026-03-01', amount: -5000, category: 'Lazer', dayOfWeek: 0 },
      { date: '2026-03-07', amount: -8000, category: 'Alimentação', dayOfWeek: 6 },
      { date: '2026-03-08', amount: -6000, category: 'Lazer', dayOfWeek: 0 },
      { date: '2026-03-14', amount: -7000, category: 'Alimentação', dayOfWeek: 6 },
      { date: '2026-03-02', amount: -1000, category: 'Transporte', dayOfWeek: 1 },
      { date: '2026-03-03', amount: -1000, category: 'Transporte', dayOfWeek: 2 },
    ]
    const results = analyzeBehavior({ transactions, averageTransactionAmount: { current: 4000, previous: 4000 } })
    expect(results.find((r) => r.type === 'behavior_weekend_heavy')).toBeDefined()
  })

  it('detects rising average transaction amount (>20% increase)', () => {
    const results = analyzeBehavior({
      transactions: [{ date: '2026-03-01', amount: -5000, category: 'Test', dayOfWeek: 1 }],
      averageTransactionAmount: { current: 6000, previous: 4000 },
    })
    expect(results.find((r) => r.type === 'behavior_avg_amount_rising')).toBeDefined()
  })
})
