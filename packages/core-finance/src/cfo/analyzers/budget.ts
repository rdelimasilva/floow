import type { BudgetAnalyzerInput, InsightResult } from '../types'

export function analyzeBudget(input: BudgetAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { goals, historicalUsage } = input

  if (goals.length === 0) return []

  for (const goal of goals) {
    const pct = goal.limit > 0 ? goal.spent / goal.limit : 0

    if (pct > 1) {
      insights.push({
        type: 'budget_exceeded',
        category: 'budget',
        severity: pct > 1.2 ? 'critical' : 'warning',
        title: `Orçamento estourado: ${goal.category}`,
        body: `Você gastou R$${(goal.spent / 100).toFixed(0)} de um limite de R$${(goal.limit / 100).toFixed(0)} (${Math.round(pct * 100)}%).`,
        metric: { limit: goal.limit, spent: goal.spent, pct: Math.round(pct * 100) },
        suggestedAction: { type: 'adjust_budget', params: { category: goal.category } },
      })
    }

    const catHistory = historicalUsage.filter((h) => h.category === goal.category)
    if (catHistory.length >= 3 && goal.limit > 0) {
      const allUnder60 = catHistory.every((h) => h.spent / goal.limit < 0.6)
      if (allUnder60) {
        const avgSpent = Math.round(catHistory.reduce((s, h) => s + h.spent, 0) / catHistory.length)
        insights.push({
          type: 'budget_consistent_slack',
          category: 'budget',
          severity: 'info',
          title: `Orçamento com folga: ${goal.category}`,
          body: `Nos últimos ${catHistory.length} meses, você gastou em média R$${(avgSpent / 100).toFixed(0)} de R$${(goal.limit / 100).toFixed(0)}. Considere realocar.`,
          metric: { limit: goal.limit, avgSpent, months: catHistory.length },
          suggestedAction: { type: 'adjust_budget', params: { category: goal.category } },
        })
      }
    }
  }

  return insights
}
