import { describe, it, expect } from 'vitest'
import { aggregateIncome, estimateMonthlyIncome } from '../income'
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
    const result = estimateMonthlyIncome(events, 3)
    expect(result).toBe(20000)
  })

  it('with fewer months than requested: uses all available months', () => {
    const events: IncomeEvent[] = [
      makeIncomeEvent({ eventType: 'dividend', totalCents: 10000, eventDate: new Date('2024-01-15') }),
      makeIncomeEvent({ eventType: 'dividend', totalCents: 20000, eventDate: new Date('2024-02-15') }),
    ]
    // Request 12 months but only 2 exist — average over 2 months
    const result = estimateMonthlyIncome(events, 12)
    expect(result).toBe(15000) // (10000 + 20000) / 2 = 15000
  })
})
