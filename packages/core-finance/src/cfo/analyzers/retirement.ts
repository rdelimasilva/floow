import type { RetirementAnalyzerInput, InsightResult } from '../types'

export function analyzeRetirement(input: RetirementAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { plan, currentSavingsRate, netWorth } = input

  if (!plan) return []

  const yearsToGo = plan.targetAge - plan.currentAge
  if (yearsToGo <= 0) return []

  const requiredNestEgg = plan.desiredIncome * 12 * 25
  const monthsToGo = yearsToGo * 12
  const projectedSavings = netWorth + plan.monthlyContribution * monthsToGo
  const progressPct = requiredNestEgg > 0 ? Math.round((projectedSavings / requiredNestEgg) * 100) : 0

  if (progressPct >= 100) {
    insights.push({
      type: 'retirement_on_track',
      category: 'retirement',
      severity: 'positive',
      title: 'Aposentadoria no caminho certo',
      body: `Mantendo a contribuição atual, você atingirá ${progressPct}% da meta aos ${plan.targetAge} anos.`,
      metric: { progressPct, yearsToGo, projectedSavings, requiredNestEgg },
    })
  } else {
    const gap = requiredNestEgg - projectedSavings
    const extraMonthly = monthsToGo > 0 ? Math.round(gap / monthsToGo) : 0

    insights.push({
      type: 'retirement_behind',
      category: 'retirement',
      severity: progressPct < 50 ? 'warning' : 'info',
      title: 'Aposentadoria abaixo da meta',
      body: `Projeção cobre ${progressPct}% da meta. Aumente R$${(extraMonthly / 100).toFixed(0)}/mês para fechar o gap.`,
      metric: { progressPct, gap, extraMonthly, yearsToGo },
      suggestedAction: { type: 'view_planning', params: {} },
    })
  }

  return insights
}
