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

  it('consolida os lotes do mesmo ativo antes de medir a concentração', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [
        { asset: 'NTN-F', class: 'treasury', allocation: 52.1, pnlPercent: 2.56 },
        { asset: 'CDB XP', class: 'fixed_income', allocation: 38, pnlPercent: 10 },
        { asset: 'NTN-F', class: 'treasury', allocation: 7.8, pnlPercent: -2.88 },
        { asset: 'NTN-F', class: 'treasury', allocation: 2.1, pnlPercent: 7.86 },
      ],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    const conc = analyzeInvestment(input).filter((r) => r.type === 'investment_concentration')
    expect(conc).toHaveLength(1)
    expect(conc[0].metric.allocation).toBeCloseTo(62, 5)
    expect(conc[0].body).toContain('62%')
  })

  it('prejuízo é medido no ativo consolidado, não por lote', () => {
    const input: InvestmentAnalyzerInput = {
      positions: [
        // custo 10 / 1.0 = 10 e 10 / 0.5 = 20 → valor 20, custo 30 → -33,3%
        { asset: 'X', class: 'br_equity', allocation: 10, pnlPercent: 0 },
        { asset: 'X', class: 'br_equity', allocation: 10, pnlPercent: -50 },
      ],
      totalInvested: 100000, dividendsReceived: 0, dividendsExpected: 0,
    }
    const loss = analyzeInvestment(input).filter((r) => r.type === 'investment_large_loss')
    expect(loss).toHaveLength(1)
    expect(loss[0].metric.pnlPercent).toBeCloseTo(-33.33, 1)
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
