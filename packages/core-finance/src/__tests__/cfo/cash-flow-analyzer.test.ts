import { describe, it, expect } from 'vitest'
import { analyzeCashFlow } from '../../cfo/analyzers/cash-flow'
import type { CashFlowAnalyzerInput } from '../../cfo/types'

describe('analyzeCashFlow', () => {
  it('returns empty array when no data', () => {
    const input: CashFlowAnalyzerInput = { monthlyTotals: [], accountBalances: [] }
    expect(analyzeCashFlow(input)).toEqual([])
  })

  it('returns critical when expenses > income', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 400000, expense: -450000 }],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_expenses_exceed_income')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns warning when expenses > 90% of income', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 500000, expense: -460000 }],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_high_expense_ratio')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('warning')
  })

  it('returns warning for 3 consecutive months of growing expenses', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [
        { month: '2026-03', income: 500000, expense: -350000 },
        { month: '2026-02', income: 500000, expense: -300000 },
        { month: '2026-01', income: 500000, expense: -250000 },
      ],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_expense_trend_rising')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('warning')
  })

  it('does not flag rising trend with only 2 months', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [
        { month: '2026-02', income: 500000, expense: -300000 },
        { month: '2026-01', income: 500000, expense: -250000 },
      ],
      accountBalances: [],
    }
    const results = analyzeCashFlow(input)
    expect(results.find((r) => r.type === 'cash_flow_expense_trend_rising')).toBeUndefined()
  })

  it('returns critical when account balance is negative', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [],
      accountBalances: [{ accountId: 'a1', name: 'Conta Corrente', balance: -5000 }],
    }
    const results = analyzeCashFlow(input)
    const found = results.find((r) => r.type === 'cash_flow_negative_balance')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns no insights when finances are healthy', () => {
    const input: CashFlowAnalyzerInput = {
      monthlyTotals: [{ month: '2026-03', income: 500000, expense: -200000 }],
      accountBalances: [{ accountId: 'a1', name: 'Conta Corrente', balance: 100000 }],
    }
    expect(analyzeCashFlow(input)).toEqual([])
  })
})
