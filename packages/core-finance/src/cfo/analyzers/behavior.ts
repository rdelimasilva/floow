import type { BehaviorAnalyzerInput, InsightResult } from '../types'

export function analyzeBehavior(input: BehaviorAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { transactions, averageTransactionAmount } = input

  if (transactions.length === 0) return []

  let weekendSpend = 0
  let weekdaySpend = 0
  for (const tx of transactions) {
    const amount = Math.abs(tx.amount)
    if (tx.dayOfWeek === 0 || tx.dayOfWeek === 6) {
      weekendSpend += amount
    } else {
      weekdaySpend += amount
    }
  }
  const totalSpend = weekendSpend + weekdaySpend
  const weekendPct = totalSpend > 0 ? Math.round((weekendSpend / totalSpend) * 100) : 0

  if (weekendPct > 40) {
    insights.push({
      type: 'behavior_weekend_heavy',
      category: 'behavior',
      severity: 'info',
      title: 'Gastos concentrados no fim de semana',
      body: `${weekendPct}% dos seus gastos acontecem no sábado e domingo.`,
      metric: { weekendPct, weekendSpend, weekdaySpend },
    })
  }

  const { current, previous } = averageTransactionAmount
  if (previous > 0) {
    const increase = Math.round(((current - previous) / previous) * 100)
    if (increase > 20) {
      insights.push({
        type: 'behavior_avg_amount_rising',
        category: 'behavior',
        severity: 'info',
        title: 'Valor médio por transação subindo',
        body: `O valor médio das suas transações subiu ${increase}% em relação ao período anterior.`,
        metric: { current, previous, increase },
      })
    }
  }

  return insights
}
