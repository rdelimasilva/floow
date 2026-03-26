import { describe, it, expect } from 'vitest'
import { analyzeInvestment } from '../../cfo/analyzers/investment'
import type { InvestmentAnalyzerInput } from '../../cfo/types'

describe('analyzeInvestment', () => {
  it('returns empty when no positions', () => {
    expect(analyzeInvestment({ positions: [], totalInvested: 0, dividendsReceived: 0, dividendsExpected: 0 })).toEqual([])
  })

  it('returns warning for concentration > 40%', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [
        { asset: 'PETR4', class: 'br_equity', allocation: 45, pnlPercent: 10 },
        { asset: 'VALE3', class: 'br_equity', allocation: 55, pnlPercent: 5 },
      ],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    expect(analyzeInvestment(input).find((r) => r.type === 'investment_concentration')).toBeDefined()
  })

  it('returns info for position with loss > 20%', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [{ asset: 'MGLU3', class: 'br_equity', allocation: 10, pnlPercent: -25 }],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    const found = analyzeInvestment(input).find((r) => r.type === 'investment_large_loss')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('info')
  })
})
