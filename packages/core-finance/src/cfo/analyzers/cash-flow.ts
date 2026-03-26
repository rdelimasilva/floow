import type { CashFlowAnalyzerInput, InsightResult } from '../types'

export function analyzeCashFlow(input: CashFlowAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { monthlyTotals, accountBalances } = input

  if (monthlyTotals.length === 0 && accountBalances.length === 0) return []

  const sorted = [...monthlyTotals].sort((a, b) => b.month.localeCompare(a.month))
  const current = sorted[0]

  if (current) {
    const absExpense = Math.abs(current.expense)
    const ratio = current.income > 0 ? absExpense / current.income : 0

    if (current.income > 0 && absExpense > current.income) {
      insights.push({
        type: 'cash_flow_expenses_exceed_income',
        category: 'cash_flow',
        severity: 'critical',
        title: 'Gastos maiores que a receita',
        body: `Em ${current.month}, seus gastos (R$${(absExpense / 100).toFixed(0)}) superaram a receita (R$${(current.income / 100).toFixed(0)}).`,
        metric: { income: current.income, expense: current.expense, ratio: Math.round(ratio * 100) },
        suggestedAction: { type: 'view_transactions', params: { period: current.month } },
      })
    } else if (ratio > 0.9) {
      insights.push({
        type: 'cash_flow_high_expense_ratio',
        category: 'cash_flow',
        severity: 'warning',
        title: 'Gastos próximos do limite da receita',
        body: `Seus gastos representam ${Math.round(ratio * 100)}% da receita em ${current.month}.`,
        metric: { income: current.income, expense: current.expense, ratio: Math.round(ratio * 100) },
        suggestedAction: { type: 'create_budget', params: {} },
      })
    }
  }

  if (sorted.length >= 3) {
    const [m1, m2, m3] = sorted
    const e1 = Math.abs(m1.expense)
    const e2 = Math.abs(m2.expense)
    const e3 = Math.abs(m3.expense)

    if (e1 > e2 && e2 > e3) {
      const growthRate = e2 > 0 ? Math.round(((e1 - e2) / e2) * 100) : 0
      insights.push({
        type: 'cash_flow_expense_trend_rising',
        category: 'cash_flow',
        severity: 'warning',
        title: 'Tendência de gastos crescentes',
        body: `Seus gastos cresceram por 3 meses consecutivos. Último mês: +${growthRate}%.`,
        metric: { month1_expense: m1.expense, month2_expense: m2.expense, month3_expense: m3.expense, growthRate },
      })
    }
  }

  for (const account of accountBalances) {
    if (account.balance < 0) {
      insights.push({
        type: 'cash_flow_negative_balance',
        category: 'cash_flow',
        severity: 'critical',
        title: `Saldo negativo: ${account.name}`,
        body: `A conta "${account.name}" está com saldo negativo de R$${(Math.abs(account.balance) / 100).toFixed(2)}.`,
        metric: { balance: account.balance },
        suggestedAction: { type: 'view_account', params: { accountId: account.accountId } },
      })
    }
  }

  return insights
}
