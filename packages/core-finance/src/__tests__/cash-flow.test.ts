import { describe, it, expect } from 'vitest'
import { aggregateCashFlow } from '../cash-flow'

const makeDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

const SAMPLE_TRANSACTIONS = [
  // January 2024 income
  { date: makeDate(2024, 1, 15), amountCents: 500000, type: 'income' as const },
  { date: makeDate(2024, 1, 16), amountCents: 100000, type: 'income' as const },
  // January 2024 expenses
  { date: makeDate(2024, 1, 20), amountCents: -15075, type: 'expense' as const },
  { date: makeDate(2024, 1, 25), amountCents: -8990, type: 'expense' as const },
  // February 2024 income
  { date: makeDate(2024, 2, 5), amountCents: 500000, type: 'income' as const },
  // February 2024 expense
  { date: makeDate(2024, 2, 10), amountCents: -30000, type: 'expense' as const },
]

describe('aggregateCashFlow', () => {
  it('returns empty array for empty input', () => {
    const result = aggregateCashFlow([])
    expect(result).toEqual([])
  })

  it('groups transactions by month in YYYY-MM format', () => {
    const result = aggregateCashFlow(SAMPLE_TRANSACTIONS)
    const months = result.map((r) => r.month)
    expect(months).toContain('2024-01')
    expect(months).toContain('2024-02')
    expect(result.length).toBe(2)
  })

  it('separates income and expense totals correctly', () => {
    const result = aggregateCashFlow(SAMPLE_TRANSACTIONS)
    const jan = result.find((r) => r.month === '2024-01')!
    expect(jan.income).toBe(600000) // 500000 + 100000
    expect(jan.expense).toBe(-24065) // -15075 + -8990
  })

  it('calculates net as income + expense (where expense is negative)', () => {
    const result = aggregateCashFlow(SAMPLE_TRANSACTIONS)
    const jan = result.find((r) => r.month === '2024-01')!
    expect(jan.net).toBe(jan.income + jan.expense) // 600000 + (-24065) = 575935
    expect(jan.net).toBe(575935)
  })

  it('sorts months descending (most recent first)', () => {
    const result = aggregateCashFlow(SAMPLE_TRANSACTIONS)
    expect(result[0].month).toBe('2024-02')
    expect(result[1].month).toBe('2024-01')
  })

  it('handles single transaction correctly', () => {
    const result = aggregateCashFlow([
      { date: makeDate(2024, 3, 1), amountCents: 100000, type: 'income' as const },
    ])
    expect(result.length).toBe(1)
    expect(result[0].month).toBe('2024-03')
    expect(result[0].income).toBe(100000)
    expect(result[0].expense).toBe(0)
    expect(result[0].net).toBe(100000)
  })

  it('correctly calculates February totals', () => {
    const result = aggregateCashFlow(SAMPLE_TRANSACTIONS)
    const feb = result.find((r) => r.month === '2024-02')!
    expect(feb.income).toBe(500000)
    expect(feb.expense).toBe(-30000)
    expect(feb.net).toBe(470000)
  })
})
