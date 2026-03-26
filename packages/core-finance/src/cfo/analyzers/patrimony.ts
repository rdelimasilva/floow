import type { PatrimonyAnalyzerInput, InsightResult } from '../types'

const MILESTONES = [5000000, 10000000, 15000000, 20000000, 25000000, 50000000, 100000000]

export function analyzePatrimony(input: PatrimonyAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { snapshots, fixedAssets } = input

  if (snapshots.length === 0) return []

  const sorted = [...snapshots].sort((a, b) => b.month.localeCompare(a.month))
  const current = sorted[0]
  const previous = sorted[1]

  if (previous) {
    const change = current.netWorth - previous.netWorth
    const changePct = previous.netWorth > 0 ? Math.round((change / previous.netWorth) * 100) : 0

    for (const milestone of MILESTONES) {
      if (current.netWorth >= milestone && previous.netWorth < milestone) {
        insights.push({
          type: 'patrimony_milestone',
          category: 'patrimony',
          severity: 'positive',
          title: `Patrimônio atingiu R$${(milestone / 100).toLocaleString('pt-BR')}!`,
          body: `Seu patrimônio líquido ultrapassou a marca de R$${(milestone / 100).toLocaleString('pt-BR')}.`,
          metric: { netWorth: current.netWorth, milestone },
        })
        break
      }
    }

    if (change < 0) {
      insights.push({
        type: 'patrimony_decreased',
        category: 'patrimony',
        severity: Math.abs(changePct) > 10 ? 'warning' : 'info',
        title: 'Patrimônio diminuiu',
        body: `Seu patrimônio caiu ${Math.abs(changePct)}% (R$${(Math.abs(change) / 100).toFixed(0)}) em relação ao mês anterior.`,
        metric: { current: current.netWorth, previous: previous.netWorth, changePct },
      })
    }
  }

  for (const asset of fixedAssets) {
    if (asset.previousValue > 0) {
      const changePct = Math.round(((asset.currentValue - asset.previousValue) / asset.previousValue) * 100)
      if (Math.abs(changePct) > 10) {
        insights.push({
          type: 'patrimony_fixed_asset_change',
          category: 'patrimony',
          severity: changePct > 0 ? 'positive' : 'warning',
          title: `${asset.name}: variação de ${changePct}%`,
          body: `O valor de "${asset.name}" ${changePct > 0 ? 'subiu' : 'caiu'} ${Math.abs(changePct)}%.`,
          metric: { currentValue: asset.currentValue, previousValue: asset.previousValue, changePct },
        })
      }
    }
  }

  return insights
}
