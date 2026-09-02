import type { InsightResult } from '../types'
import type { BudgetPacingResult } from '../../budget-pacing'

export interface BudgetPacingAnalyzerInput {
  /** Resultado de computeBudgetPacing para o mês corrente. */
  pacing: BudgetPacingResult
  /** categoryId -> nome exibível. Sem isso o insight sairia com um UUID. */
  categoryNames: Record<string, string>
  /** Mês analisado, YYYY-MM — vai no metric para o consumidor saber a que se refere. */
  month: string
}

const brl = (cents: number) => `R$${(cents / 100).toFixed(0)}`

/**
 * Insights de ritmo de gasto: avisam ANTES do estouro, que é o que o analyzer
 * de orçamento original não faz (ele só reage a `spent > limit`, e recebe
 * `spent: 0` do engine, de modo que nunca dispara).
 *
 * Duas regras, deliberadamente estreitas para não virar ruído diário:
 *   - `estourado` sempre gera insight — é fato consumado, não previsão.
 *   - `risco` só gera insight quando a projeção é confiável. Antes do dia 7
 *     do mês a extrapolação é ruído estatístico, e alertar sobre ela treinaria
 *     o usuário a ignorar os alertas.
 *
 * Mês futuro não gera nada: não há gasto decorrido para julgar.
 */
export function analyzeBudgetPacing(input: BudgetPacingAnalyzerInput): InsightResult[] {
  const { pacing, categoryNames, month } = input
  const { total, byCategory } = pacing

  if (total.daysElapsed === 0) return []

  const insights: InsightResult[] = []
  const nameOf = (id: string) => categoryNames[id] ?? 'Categoria sem nome'

  for (const cat of byCategory) {
    if (cat.status === 'estourado') {
      const pct = cat.plannedCents > 0 ? Math.round((cat.spentCents / cat.plannedCents) * 100) : 0
      insights.push({
        type: 'budget_pacing_exceeded',
        category: 'budget',
        severity: pct > 120 ? 'critical' : 'warning',
        title: `Orçamento estourado: ${nameOf(cat.categoryId)}`,
        body: `Você já gastou ${brl(cat.spentCents)} de um teto de ${brl(cat.plannedCents)} (${pct}%), e ainda faltam ${total.daysInMonth - total.daysElapsed} dias no mês.`,
        metric: {
          plannedCents: cat.plannedCents,
          spentCents: cat.spentCents,
          projectedCents: cat.projectedCents,
          pct,
          daysElapsed: total.daysElapsed,
          daysInMonth: total.daysInMonth,
        },
        suggestedAction: { type: 'adjust_budget', params: { categoryId: cat.categoryId } },
      })
      continue
    }

    // Alerta preditivo apenas com projeção confiável.
    if (cat.status === 'risco' && total.confidence === 'normal') {
      const projPct =
        cat.plannedCents > 0 ? Math.round((cat.projectedCents / cat.plannedCents) * 100) : 0
      insights.push({
        type: 'budget_pacing_risk',
        category: 'budget',
        severity: 'warning',
        title: `No ritmo atual, ${nameOf(cat.categoryId)} vai estourar`,
        body: `Você gastou ${brl(cat.spentCents)} em ${total.daysElapsed} dias. Mantido esse ritmo, o mês fecha em ${brl(cat.projectedCents)} contra um teto de ${brl(cat.plannedCents)} (${projPct}%).`,
        metric: {
          plannedCents: cat.plannedCents,
          spentCents: cat.spentCents,
          projectedCents: cat.projectedCents,
          projectedPct: projPct,
          daysElapsed: total.daysElapsed,
          daysInMonth: total.daysInMonth,
        },
        suggestedAction: { type: 'adjust_budget', params: { categoryId: cat.categoryId } },
      })
    }
  }

  // Um resumo do mês só quando o total projetado estoura e a projeção é
  // confiável — evita repetir por categoria o que já foi dito acima.
  if (
    total.confidence === 'normal' &&
    total.plannedCents > 0 &&
    total.projectedCents > total.plannedCents
  ) {
    const projPct = Math.round((total.projectedCents / total.plannedCents) * 100)
    insights.push({
      type: 'budget_pacing_month_over',
      category: 'budget',
      severity: projPct > 110 ? 'warning' : 'info',
      title: 'Mês caminha para fechar acima do orçado',
      body: `No dia ${total.daysElapsed} de ${total.daysInMonth} você gastou ${brl(total.spentCents)} de ${brl(total.plannedCents)}. No ritmo atual o mês fecha em ${brl(total.projectedCents)} (${projPct}%).`,
      metric: {
        plannedCents: total.plannedCents,
        spentCents: total.spentCents,
        projectedCents: total.projectedCents,
        unbudgetedCents: total.unbudgetedCents,
        projectedPct: projPct,
        daysElapsed: total.daysElapsed,
        daysInMonth: total.daysInMonth,
      },
      suggestedAction: { type: 'view_pacing', params: { month } },
    })
  }

  return insights
}
