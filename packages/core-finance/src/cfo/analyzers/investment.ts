import type { InvestmentAnalyzerInput, InsightResult } from '../types'
import { pct } from '../formato'

type Position = InvestmentAnalyzerInput['positions'][number]

/**
 * Junta os lotes do mesmo ativo (mesmo nome e classe). A posição chega por
 * snapshot de ativo, e o mesmo título comprado em datas diferentes vira linhas
 * separadas: três lotes de NTN-F mediam 52% cada um enquanto o ativo somava
 * 62%. O resultado consolidado sai do custo de cada lote
 * (valor / (1 + pnl)), não da média simples dos percentuais.
 */
function consolidarPorAtivo(positions: Position[]): Position[] {
  const porAtivo = new Map<string, { pos: Position; custo: number }>()
  for (const p of positions) {
    const chave = `${p.class}\u0000${p.asset}`
    const custo = p.pnlPercent > -100 ? p.allocation / (1 + p.pnlPercent / 100) : 0
    const atual = porAtivo.get(chave)
    if (!atual) {
      porAtivo.set(chave, { pos: { ...p }, custo })
      continue
    }
    atual.pos.allocation += p.allocation
    atual.custo += custo
    atual.pos.pnlPercent = atual.custo > 0 ? (atual.pos.allocation / atual.custo - 1) * 100 : 0
  }
  return [...porAtivo.values()].map((v) => v.pos)
}

export function analyzeInvestment(input: InvestmentAnalyzerInput): InsightResult[] {
  const insights: InsightResult[] = []
  const positions = consolidarPorAtivo(input.positions)

  if (positions.length === 0) return []

  for (const pos of positions) {
    if (pos.allocation > 40) {
      insights.push({
        type: 'investment_concentration',
        category: 'investment',
        severity: 'warning',
        title: `Concentração alta: ${pos.asset}`,
        body: `${pos.asset} representa ${pct(pos.allocation)} da sua carteira. Considere diversificar.`,
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
        title: `Prejuízo em ${pos.asset}: ${pct(pos.pnlPercent, 1)}`,
        body: `${pos.asset} acumula ${pct(pos.pnlPercent, 1)} de prejuízo. Avalie se faz sentido manter.`,
        metric: { pnlPercent: pos.pnlPercent, allocation: pos.allocation },
      })
    }
  }

  return insights
}
