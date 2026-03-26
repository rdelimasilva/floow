import { describe, it, expect } from 'vitest'
import { analyzeDebt } from '../../cfo/analyzers/debt'
import type { DebtAnalyzerInput } from '../../cfo/types'

describe('analyzeDebt', () => {
  it('returns empty array when no debts', () => {
    expect(analyzeDebt({ debts: [], monthlyIncome: 500000 })).toEqual([])
  })

  it('does not flag when interest < 30% of income', () => {
    const input: DebtAnalyzerInput = {
      debts: [{ name: 'Empréstimo', balance: 10000000, monthlyPayment: 200000, interestRate: 0.12, isOverdraft: false }],
      monthlyIncome: 500000,
    }
    expect(analyzeDebt(input).find((r) => r.type === 'debt_high_interest_cost')).toBeUndefined()
  })

  it('returns critical for active overdraft', () => {
    const input: DebtAnalyzerInput = {
      debts: [{ name: 'Cheque Especial', balance: 200000, monthlyPayment: 50000, interestRate: 0.15, isOverdraft: true }],
      monthlyIncome: 500000,
    }
    const found = analyzeDebt(input).find((r) => r.type === 'debt_overdraft_active')
    expect(found).toBeDefined()
    expect(found!.severity).toBe('critical')
  })

  it('returns critical when total interest > 30% of income', () => {
    const input: DebtAnalyzerInput = {
      debts: [
        { name: 'A', balance: 5000000, monthlyPayment: 100000, interestRate: 0.24, isOverdraft: false },
        { name: 'B', balance: 3000000, monthlyPayment: 80000, interestRate: 0.36, isOverdraft: false },
      ],
      monthlyIncome: 500000,
    }
    expect(analyzeDebt(input).find((r) => r.type === 'debt_high_interest_cost')).toBeDefined()
  })
})
