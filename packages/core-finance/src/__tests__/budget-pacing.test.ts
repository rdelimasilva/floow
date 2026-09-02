import { describe, it, expect } from 'vitest'
import { computeBudgetPacing } from '../budget-pacing'

/** Datas sempre em UTC ao meio-dia, para não haver deslocamento de fuso. */
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0))

describe('computeBudgetPacing', () => {
  it('devolve estrutura zerada para entrada vazia, sem lançar exceção', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.daysInMonth).toBe(30)
    expect(result.byCategory).toEqual([])
    expect(result.series).toHaveLength(30)
  })
})
