import type { InvestmentAnalyzerInput, InsightResult } from '../types'

export function analyzeInvestment(input: InvestmentAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const { positions } = input

  if (positions.length === 0) return []

  for (const pos of positions) {
    if (pos.allocation > 40) {
      insights.push({
        type: 'investment_concentration',
        category: 'investment',
        severity: 'warning',
        title: `Concentração alta: ${pos.asset}`,
        body: `${pos.asset} representa ${pos.allocation}% da sua carteira. Considere diversificar.`,
        metric: { allocation: pos.allocation },
        suggestedAction: { type: 'view_investments', params: {} },
      })
    }
  }

  for (const pos of positions) {
    if (pos.pnlPercent < -20) {
      insights.push({
        type: 'investment_large_loss',
        category: 'investment',
        severity: 'info',
        title: `Prejuízo em ${pos.asset}: ${pos.pnlPercent}%`,
        body: `${pos.asset} acumula ${pos.pnlPercent}% de prejuízo. Avalie se faz sentido manter.`,
        metric: { pnlPercent: pos.pnlPercent, allocation: pos.allocation },
      })
    }
  }

  return insights
}
