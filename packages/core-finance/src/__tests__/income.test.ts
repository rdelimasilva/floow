import { describe, it, expect } from 'vitest'
import { aggregateIncome, estimateMonthlyIncome, lastIncomeMonths } from '../income'
import type { IncomeEvent } from '../income'

// Helper to create a minimal IncomeEvent for testing
function makeIncomeEvent(overrides: Partial<IncomeEvent>): IncomeEvent {
  return {
    eventType: 'dividend',
    totalCents: 10000,
    eventDate: new Date('2024-01-15'),
    assetTicker: 'ITUB4',
    assetName: 'Itau Unibanco',
    ...overrides,
  }
}

describe('aggregateIncome', () => {
  it('returns empty array for empty input', () => {
    const result = aggregateIncome([])
    expect(result).toEqual([])
  })

  it('single dividend event: one IncomeMonth entry with correct totalCents', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 20000, eventDate: new Date('2024-04-15') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(1)
    expect(result[0].month).toBe('2024-04')
    expect(result[0].totalCents).toBe(20000)
    expect(result[0].dividendCents).toBe(20000)
    expect(result[0].interestCents).toBe(0)
    expect(result[0].amortizationCents).toBe(0)
    expect(result[0].eventCount).toBe(1)
  })

  it('multiple events in same month: aggregated into single IncomeMonth entry', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-03-10') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 5000, eventDate: new Date('2024-03-20') }),
      makeIncomeEvent({ eventType: 'interest', totalCents: 3000, eventDate: new Date('2024-03-25') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(1)
    expect(result[0].month).toBe('2024-03')
    expect(result[0].totalCents).toBe(18000)
    expect(result[0].dividendCents).toBe(15000)
    expect(result[0].interestCents).toBe(3000)
    expect(result[0].amortizationCents).toBe(0)
    expect(result[0].eventCount).toBe(3)
  })

  it('events across months: separate IncomeMonth entries sorted descending', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 12000, eventDate: new Date('2024-03-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 11000, eventDate: new Date('2024-02-15') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(3)
    // Should be sorted descending (most recent first)
    expect(result[0].month).toBe('2024-03')
    expect(result[1].month).toBe('2024-02')
    expect(result[2].month).toBe('2024-01')
  })

  it('mixed event types (dividend + interest + amortization) all counted as income', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-06-10') }),
      makeIncomeEvent({ eventType: 'interest', totalCents: 5000, eventDate: new Date('2024-06-15') }),
      makeIncomeEvent({ eventType: 'amortization', totalCents: 3000, eventDate: new Date('2024-06-20') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(1)
    expect(result[0].totalCents).toBe(18000)
    expect(result[0].dividendCents).toBe(10000)
    expect(result[0].interestCents).toBe(5000)
    expect(result[0].amortizationCents).toBe(3000)
  })

  it('jcp conta como renda, no balde de dividendos', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'jcp', totalCents: 700, eventDate: new Date('2024-06-10') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 300, eventDate: new Date('2024-06-12') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(1)
    expect(result[0].totalCents).toBe(1000)
    expect(result[0].dividendCents).toBe(1000)
    expect(result[0].eventCount).toBe(2)
  })

  it('buy/sell events filtered out (not income)', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'buy', totalCents: 100000, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'sell', totalCents: 120000, eventDate: new Date('2024-02-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 5000, eventDate: new Date('2024-03-01') }),
    ]
    const result = aggregateIncome(events)
    // Only the dividend event should be counted
    expect(result).toHaveLength(1)
    expect(result[0].month).toBe('2024-03')
    expect(result[0].totalCents).toBe(5000)
  })

  it('split events are filtered out (not income)', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'split', totalCents: null, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 8000, eventDate: new Date('2024-01-20') }),
    ]
    const result = aggregateIncome(events)
    expect(result).toHaveLength(1)
    expect(result[0].totalCents).toBe(8000)
  })
})

describe('estimateMonthlyIncome', () => {
  it('returns 0 for empty events', () => {
    const result = estimateMonthlyIncome([])
    expect(result).toBe(0)
  })

  it('returns average of last N months', () => {
    // 3 months of income data
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 20000, eventDate: new Date('2024-02-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 30000, eventDate: new Date('2024-03-15') }),
    ]
    // Average over 3 months = (10000 + 20000 + 30000) / 3 = 20000
    const result = estimateMonthlyIncome(events, 3, new Date('2024-03-20'))
    expect(result).toBe(20000)
  })

  it('with fewer months than requested: uses all available months', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 20000, eventDate: new Date('2024-02-15') }),
    ]
    // Request 12 months but history only starts 2 months ago — average over 2 months
    const result = estimateMonthlyIncome(events, 12, new Date('2024-02-20'))
    expect(result).toBe(15000) // (10000 + 20000) / 2 = 15000
  })

  // Revisão de 18/10/2026: "média dos últimos 12 meses" dividia o total pelos
  // 6 meses que tiveram provento — mês sem receita conta como zero.
  it('mês sem receita no meio da janela entra como zero na média', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ totalCents: 12000, eventDate: new Date('2025-11-10') }),
      makeIncomeEvent({ totalCents: 12000, eventDate: new Date('2026-10-05') }),
    ]
    // Nov/25 a Out/26 = 12 meses, só 2 com provento
    expect(estimateMonthlyIncome(events, 12, new Date('2026-10-18'))).toBe(2000)
  })

  it('provento anterior à janela fica de fora', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ totalCents: 99900, eventDate: new Date('2025-10-20') }),
      makeIncomeEvent({ totalCents: 12000, eventDate: new Date('2025-11-10') }),
    ]
    expect(estimateMonthlyIncome(events, 12, new Date('2026-10-18'))).toBe(1000)
  })
})

describe('lastIncomeMonths', () => {
  it('devolve os N meses da janela, do mais recente ao mais antigo, com zero onde não houve renda', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ totalCents: 5000, eventDate: new Date('2026-08-10') }),
      makeIncomeEvent({ eventType: 'interest', totalCents: 700, eventDate: new Date('2026-10-01') }),
    ]
    const result = lastIncomeMonths(events, 4, new Date('2026-10-18'))
    expect(result.map((m) => m.month)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
    expect(result.map((m) => m.totalCents)).toEqual([700, 0, 5000, 0])
    expect(result[1]).toMatchObject({ dividendCents: 0, interestCents: 0, amortizationCents: 0, eventCount: 0 })
  })

  it('vira o ano corretamente', () => {
    const result = lastIncomeMonths([], 3, new Date('2026-01-15'))
    expect(result.map((m) => m.month)).toEqual(['2026-01', '2025-12', '2025-11'])
  })
})
