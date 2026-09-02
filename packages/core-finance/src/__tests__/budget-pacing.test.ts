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

  it('acumula gasto por tipo de conta ao longo dos dias', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-01', accountType: 'credit_card', categoryId: 'a', cents: 10000 },
        { date: '2026-09-03', accountType: 'credit_card', categoryId: 'a', cents: 5000 },
        { date: '2026-09-03', accountType: 'checking', categoryId: 'a', cents: 2000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    const d1 = result.series[0]
    const d2 = result.series[1]
    const d3 = result.series[2]

    expect(d1.byAccountTypeCum.credit_card).toBe(10000)
    // Dia sem transação mantém o acumulado do dia anterior.
    expect(d2.byAccountTypeCum.credit_card).toBe(10000)
    expect(d3.byAccountTypeCum.credit_card).toBe(15000)
    expect(d3.byAccountTypeCum.checking).toBe(2000)
    expect(d3.byAccountTypeCum.savings).toBe(0)
    // O último dia carrega o total do mês.
    expect(result.series[29].byAccountTypeCum.credit_card).toBe(15000)
  })

  it('ignora linhas cuja data cai fora do mês analisado', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-08-31', accountType: 'checking', categoryId: 'a', cents: 99900 },
        { date: '2026-10-01', accountType: 'checking', categoryId: 'a', cents: 88800 },
        { date: '2026-09-05', accountType: 'checking', categoryId: 'a', cents: 1000 },
      ],
      budgets: [],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.series[29].byAccountTypeCum.checking).toBe(1000)
  })
})
