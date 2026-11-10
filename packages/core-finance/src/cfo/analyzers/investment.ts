import type { InvestmentAnalyzerInput, InsightResult } from '../types'
import { pct } from '../formato'

type Position = InvestmentAnalyzerInput['positions'][number]

/**
 * Junta os lotes do mesmo ativo (mesmo nome e classe). A posição chega por
 * snapshot de ativo, e o mesmo título comprado em datas diferentes vira linhas
 * separadas: três lotes de NTN-F mediam 52% cada um enquanto o ativo somava
 * 62%. Hoje serve ao prejuízo. O resultado consolidado sai do custo de cada lote
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

  // Concentração saiu daqui: a aba Diagnóstico da carteira mede por ativo,
  // emissor e classe, sobre o patrimônio todo.
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
