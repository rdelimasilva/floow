import { describe, it, expect } from 'vitest'
import { computePosition } from '../portfolio'
import type { PortfolioEventInput } from '../portfolio'

// Helper factory with sensible defaults
function makeEvent(overrides: Partial<PortfolioEventInput>): PortfolioEventInput {
  return {
    eventType: 'buy',
    quantity: 100,
    priceCents: 1000,
    totalCents: 100000,
    splitRatio: null,
    eventDate: new Date('2024-01-15'),
    ...overrides,
  }
}

const CURRENT_PRICE = 1500

describe('computePosition', () => {
  it('returns all zeros for empty events array', () => {
    const result = computePosition([], CURRENT_PRICE)
    expect(result.quantityHeld).toBe(0)
    expect(result.avgCostCents).toBe(0)
    expect(result.totalCostCents).toBe(0)
    expect(result.realizedPnLCents).toBe(0)
    expect(result.totalDividendsCents).toBe(0)
  })

  it('single buy event: correct quantity and average cost', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000 }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.quantityHeld).toBe(100)
    expect(result.avgCostCents).toBe(1000)
    expect(result.totalCostCents).toBe(100000)
    expect(result.realizedPnLCents).toBe(0)
  })

  it('two buy events at different prices: weighted average cost computed correctly', () => {
    const events: PortfolioEventInput[] = [
      // First buy: 100 shares at R$10.00 (1000 cents each)
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      // Second buy: 100 shares at R$20.00 (2000 cents each)
      makeEvent({ quantity: 100, priceCents: 2000, totalCents: 200000, eventDate: new Date('2024-02-15') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.quantityHeld).toBe(200)
    expect(result.totalCostCents).toBe(300000)
    // Weighted avg = 300000 / 200 = 1500
    expect(result.avgCostCents).toBe(1500)
    expect(result.realizedPnLCents).toBe(0)
  })

  it('buy then partial sell: avgCostCents unchanged, quantityHeld reduced, realizedPnL correct', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      // Sell 40 shares at R$15.00 (1500 cents each) — sell at profit
      makeEvent({ eventType: 'sell', quantity: 40, priceCents: 1500, totalCents: 60000, eventDate: new Date('2024-02-15') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.quantityHeld).toBe(60)
    // avg cost unchanged after sell (cost basis method)
    expect(result.avgCostCents).toBe(1000)
    // realized PnL = proceeds (60000) - cost_of_sold_shares (40 * 1000 = 40000) = 20000
    expect(result.realizedPnLCents).toBe(20000)
  })

  it('buy then full sell: quantityHeld=0, avgCostCents=0, realizedPnL correct', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      // Sell all 100 shares at R$12.00 (1200 cents each)
      makeEvent({ eventType: 'sell', quantity: 100, priceCents: 1200, totalCents: 120000, eventDate: new Date('2024-02-15') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.quantityHeld).toBe(0)
    expect(result.avgCostCents).toBe(0)
    expect(result.totalCostCents).toBe(0)
    // realized PnL = proceeds (120000) - cost (100000) = 20000
    expect(result.realizedPnLCents).toBe(20000)
  })

  it('buy then sell at profit: realizedPnLCents is positive', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      makeEvent({ eventType: 'sell', quantity: 50, priceCents: 2000, totalCents: 100000, eventDate: new Date('2024-06-01') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    // PnL = 100000 (proceeds) - 50000 (cost of 50 shares at avg 1000) = 50000
    expect(result.realizedPnLCents).toBeGreaterThan(0)
    expect(result.realizedPnLCents).toBe(50000)
  })

  it('buy then sell at loss: realizedPnLCents is negative', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 2000, totalCents: 200000, eventDate: new Date('2024-01-15') }),
      // Sell at R$15.00 (1500 cents), below cost of R$20.00
      makeEvent({ eventType: 'sell', quantity: 50, priceCents: 1500, totalCents: 75000, eventDate: new Date('2024-06-01') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    // PnL = 75000 (proceeds) - 100000 (cost of 50 shares at avg 2000) = -25000
    expect(result.realizedPnLCents).toBeLessThan(0)
    expect(result.realizedPnLCents).toBe(-25000)
  })

  it('buy then 2-for-1 split: quantity doubled, avgCostCents halved, total cost unchanged', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 2000, totalCents: 200000, eventDate: new Date('2024-01-15') }),
      // 2-for-1 split: splitRatio = '2.0000'
      makeEvent({ eventType: 'split', quantity: null, priceCents: null, totalCents: null, splitRatio: '2.0000', eventDate: new Date('2024-03-01') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    // Quantity doubled: 100 * 2 = 200
    expect(result.quantityHeld).toBe(200)
    // Total cost unchanged: still 200000
    expect(result.totalCostCents).toBe(200000)
    // Avg cost halved: 200000 / 200 = 1000
    expect(result.avgCostCents).toBe(1000)
    // No realized PnL from splits
    expect(result.realizedPnLCents).toBe(0)
  })

  it('dividend events accumulate into totalDividendsCents', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      // Dividend: R$200.00 (20000 cents)
      makeEvent({ eventType: 'dividend', quantity: null, priceCents: null, totalCents: 20000, eventDate: new Date('2024-04-01') }),
      // Another dividend: R$150.00 (15000 cents)
      makeEvent({ eventType: 'dividend', quantity: null, priceCents: null, totalCents: 15000, eventDate: new Date('2024-07-01') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.totalDividendsCents).toBe(35000)
    // Position unchanged by dividends
    expect(result.quantityHeld).toBe(100)
    expect(result.avgCostCents).toBe(1000)
  })

  it('processes events in chronological order regardless of input order', () => {
    const events: PortfolioEventInput[] = [
      // Sell comes first in array, but should be processed AFTER the buy (chronologically)
      makeEvent({ eventType: 'sell', quantity: 50, priceCents: 1500, totalCents: 75000, eventDate: new Date('2024-03-01') }),
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    // Should process buy first, then sell
    expect(result.quantityHeld).toBe(50)
    expect(result.avgCostCents).toBe(1000)
    // PnL = 75000 - (50 * 1000) = 25000
    expect(result.realizedPnLCents).toBe(25000)
  })

  it('interest events accumulate into totalDividendsCents (treated as income)', () => {
    const events: PortfolioEventInput[] = [
      makeEvent({ quantity: 100, priceCents: 1000, totalCents: 100000, eventDate: new Date('2024-01-15') }),
      makeEvent({ eventType: 'interest', quantity: null, priceCents: null, totalCents: 5000, eventDate: new Date('2024-04-01') }),
    ]
    const result = computePosition(events, CURRENT_PRICE)
    expect(result.totalDividendsCents).toBe(5000)
    expect(result.quantityHeld).toBe(100)
  })
})
