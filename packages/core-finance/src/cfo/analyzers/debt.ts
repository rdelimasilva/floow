import type { DebtAnalyzerInput, InsightResult } from '../types'
import { brl } from '../formato'

export function analyzeDebt(input: DebtAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { debts, monthlyIncome } = input

  if (debts.length === 0) return []

  for (const debt of debts) {
    if (debt.isOverdraft && debt.balance > 0) {
      insights.push({
        type: 'debt_overdraft_active',
        category: 'debt',
        severity: 'critical',
        title: 'Cheque especial ativo',
        body: `Você está usando ${brl(debt.balance, 2)} do cheque especial "${debt.name}". Juros de cheque especial são os mais caros do mercado.`,
        metric: { balance: debt.balance, interestRate: debt.interestRate },
        suggestedAction: { type: 'view_debts', params: {} },
      })
    }
  }

  if (monthlyIncome > 0) {
    let totalMonthlyInterest = 0
    for (const debt of debts) {
      totalMonthlyInterest += (debt.balance * debt.interestRate) / 12
    }
    const interestRatio = totalMonthlyInterest / monthlyIncome

    if (interestRatio > 0.3) {
      insights.push({
        type: 'debt_high_interest_cost',
        category: 'debt',
        severity: 'critical',
        title: 'Juros consumindo mais de 30% da renda',
        body: `Você paga ${brl(totalMonthlyInterest)}/mês em juros (${Math.round(interestRatio * 100)}% da receita).`,
        metric: { totalMonthlyInterest: Math.round(totalMonthlyInterest), monthlyIncome, ratio: Math.round(interestRatio * 100) },
        suggestedAction: { type: 'view_debts', params: {} },
      })
    }
  }

  return insights
}
