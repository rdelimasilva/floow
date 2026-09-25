/**
 * Resumo do ritmo do mês: orçado × esperado até hoje × realizado × projeção.
 * Função pura; os canais só formatam o que sai daqui.
 */
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { brl, MESES, oneLine } from './format'

export interface PacingSummary {
  orgName: string
  monthName: string
  day: number
  daysInMonth: number
  plannedCents: number
  expectedCents: number
  spentCents: number
  pctOfExpected: number
  projectedCents: number
  /** projetado − orçado: positivo estoura, negativo sobra. */
  projectedDiffCents: number
  /** Categorias em risco/estouradas, numa linha só. */
  flagged: string
  pacingUrl: string
}

export function buildPacingSummary(
  input: BudgetPacingAnalyzerInput,
  orgName: string,
  pacingUrl: string,
): PacingSummary {
  const { total, byCategory } = input.pacing
  const expectedCents =
    total.daysInMonth > 0 ? Math.round((total.plannedCents * total.daysElapsed) / total.daysInMonth) : 0
  const nameOf = (id: string) => oneLine(input.categoryNames[id] ?? 'Categoria sem nome')

  // Mesma regra do alerta (pacing-alerts.ts): estourado sempre, risco só com
  // projeção confiável. Senão o resumo do dia 3 acusaria risco em tudo.
  const estourados = byCategory.filter((c) => c.status === 'estourado')
  const emRisco =
    total.confidence === 'normal' ? byCategory.filter((c) => c.status === 'risco') : []
  const partes = [
    ...estourados.map((c) => `${nameOf(c.categoryId)} estourado`),
    ...emRisco.map((c) => `${nameOf(c.categoryId)} em risco`),
  ]

  const [, m] = input.month.split('-').map(Number)
  return {
    orgName: oneLine(orgName),
    monthName: MESES[m - 1],
    day: total.daysElapsed,
    daysInMonth: total.daysInMonth,
    plannedCents: total.plannedCents,
    expectedCents,
    spentCents: total.spentCents,
    pctOfExpected: expectedCents > 0 ? Math.round((total.spentCents / expectedCents) * 100) : 0,
    projectedCents: total.projectedCents,
    projectedDiffCents: total.projectedCents - total.plannedCents,
    flagged: partes.length > 0 ? partes.join(' · ') : 'Nenhuma categoria em risco',
    pacingUrl,
  }
}

export function projectionPhrase(diffCents: number): string {
  if (diffCents > 0) return `estoura em ${brl(diffCents)}`
  if (diffCents < 0) return `sobra ${brl(-diffCents)}`
  return 'fecha no orçado'
}

/** Texto do resumo, uma linha por item (e-mail em texto puro e testes). */
export function summaryLines(s: PacingSummary): string[] {
  return [
    `floow · ${s.orgName} — ritmo de ${s.monthName} (dia ${s.day} de ${s.daysInMonth})`,
    `Orçado no mês: ${brl(s.plannedCents)}`,
    `Esperado até hoje: ${brl(s.expectedCents)}`,
    `Realizado até hoje: ${brl(s.spentCents)} (${s.pctOfExpected}% do esperado)`,
    `Projeção do mês: ${brl(s.projectedCents)} — ${projectionPhrase(s.projectedDiffCents)}`,
    s.flagged,
    `Ver detalhes: ${s.pacingUrl}`,
  ]
}
