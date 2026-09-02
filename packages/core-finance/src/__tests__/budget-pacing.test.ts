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

  it('separa gasto orcado de nao orcado, incluindo transacao sem categoria', () => {
    const result = computeBudgetPacing({
      daily: [
        { date: '2026-09-02', accountType: 'checking', categoryId: 'alim', cents: 30000 },
        { date: '2026-09-02', accountType: 'checking', categoryId: 'saude', cents: 20000 },
        { date: '2026-09-02', accountType: 'cash', categoryId: null, cents: 5000 },
      ],
      budgets: [{ categoryId: 'alim', plannedCents: 100000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(100000)
    expect(result.total.spentCents).toBe(30000)
    // 'saude' nao tem teto e o gasto em dinheiro nao tem categoria.
    expect(result.total.unbudgetedCents).toBe(25000)
    expect(result.series[1].budgetedCum).toBe(30000)
    expect(result.series[1].unbudgetedCum).toBe(25000)
  })

  it('trata teto zero como categoria sem teto', () => {
    const result = computeBudgetPacing({
      daily: [{ date: '2026-09-02', accountType: 'checking', categoryId: 'lazer', cents: 7000 }],
      budgets: [{ categoryId: 'lazer', plannedCents: 0 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.plannedCents).toBe(0)
    expect(result.total.spentCents).toBe(0)
    expect(result.total.unbudgetedCents).toBe(7000)
    expect(result.byCategory).toEqual([])
  })

  const umPorDia = (dias: number, centsPorDia: number) =>
    Array.from({ length: dias }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      accountType: 'checking' as const,
      categoryId: 'alim',
      cents: centsPorDia,
    }))

  it('projeta o fechamento pelo ritmo corrente no mes em andamento', () => {
    // 12 dias de setembro, R$ 100,00 por dia = 120000 acumulado.
    const result = computeBudgetPacing({
      daily: umPorDia(12, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(12)
    expect(result.total.spentCents).toBe(120000)
    // 120000 / 12 * 30 = 300000
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('normal')
  })

  it('marca confianca baixa antes do dia 7', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(3, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 3),
    })

    expect(result.total.daysElapsed).toBe(3)
    expect(result.total.confidence).toBe('low')
    expect(result.total.projectedCents).toBe(300000)
  })

  it('no dia 1 projeta sem dividir por zero', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(1, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 1),
    })

    expect(result.total.daysElapsed).toBe(1)
    expect(result.total.projectedCents).toBe(300000)
    expect(Number.isFinite(result.total.projectedCents)).toBe(true)
  })

  it('em mes encerrado a projecao iguala o realizado', () => {
    const result = computeBudgetPacing({
      daily: umPorDia(30, 10000),
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 10, 15),
    })

    expect(result.total.daysElapsed).toBe(30)
    expect(result.total.spentCents).toBe(300000)
    expect(result.total.projectedCents).toBe(300000)
    expect(result.total.confidence).toBe('final')
  })

  it('em mes futuro zera dias decorridos e projecao', () => {
    const result = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 250000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })

    expect(result.total.daysElapsed).toBe(0)
    expect(result.total.projectedCents).toBe(0)
    expect(result.total.confidence).toBe('low')
    expect(result.total.daysInMonth).toBe(31)
  })

  it('conta 28 dias em fevereiro nao bissexto e 31 em janeiro', () => {
    const fev = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 2, 1), today: utc(2026, 2, 10),
    })
    const jan = computeBudgetPacing({
      daily: [], budgets: [], monthStart: utc(2026, 1, 1), today: utc(2026, 1, 10),
    })

    expect(fev.total.daysInMonth).toBe(28)
    expect(fev.series).toHaveLength(28)
    expect(jan.total.daysInMonth).toBe(31)
  })
})
