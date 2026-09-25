import { describe, it, expect } from 'vitest'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { buildPacingSummary, projectionPhrase, summaryLines } from '@/lib/notifications/pacing-summary'
import { oneLine } from '@/lib/notifications/format'

type Cat = BudgetPacingAnalyzerInput['pacing']['byCategory'][number]

function input(over: Partial<BudgetPacingAnalyzerInput['pacing']['total']> = {}, cats: Cat[] = []) {
  return {
    month: '2026-09',
    categoryNames: { m: 'Mercado', l: 'Lazer', t: 'Transporte\n<b>' },
    pacing: {
      series: [],
      total: {
        plannedCents: 800000, spentCents: 712000, unbudgetedCents: 0, projectedCents: 854000,
        confidence: 'normal', daysElapsed: 25, daysInMonth: 30, ...over,
      },
      byCategory: cats,
    },
  } as BudgetPacingAnalyzerInput
}

const cat = (categoryId: string, status: Cat['status']): Cat =>
  ({ categoryId, status, plannedCents: 1, spentCents: 1, projectedCents: 1 }) as Cat

describe('buildPacingSummary', () => {
  it('calcula esperado até hoje, % e diferença da projeção', () => {
    const s = buildPacingSummary(input(), 'Pessoal', 'https://app/budgets/pacing')
    expect(s).toMatchObject({
      orgName: 'Pessoal', monthName: 'setembro', day: 25, daysInMonth: 30,
      plannedCents: 800000, expectedCents: 666667, spentCents: 712000,
      pctOfExpected: 107, projectedCents: 854000, projectedDiffCents: 54000,
    })
  })

  it('lista estourado antes de risco, numa linha só', () => {
    const s = buildPacingSummary(
      input({}, [cat('l', 'risco'), cat('m', 'estourado'), cat('t', 'ok')]),
      'Pessoal', 'u',
    )
    expect(s.flagged).toBe('Mercado estourado · Lazer em risco')
  })

  it('risco com projeção pouco confiável não entra (mesma regra do alerta)', () => {
    const s = buildPacingSummary(input({ confidence: 'low' }, [cat('l', 'risco')]), 'P', 'u')
    expect(s.flagged).toBe('Nenhuma categoria em risco')
  })

  it('nome de categoria com quebra de linha vira uma linha', () => {
    const s = buildPacingSummary(input({}, [cat('t', 'estourado')]), 'P', 'u')
    expect(s.flagged).toBe('Transporte <b> estourado')
    expect(s.flagged).not.toMatch(/\n/)
  })

  it('sem esperado (orçado zero) não divide por zero', () => {
    const s = buildPacingSummary(input({ plannedCents: 0 }), 'P', 'u')
    expect(s.expectedCents).toBe(0)
    expect(s.pctOfExpected).toBe(0)
  })
})

describe('projectionPhrase', () => {
  it('estoura', () => expect(projectionPhrase(54000)).toBe('estoura em R$ 540,00'))
  it('sobra', () => expect(projectionPhrase(-46000)).toBe('sobra R$ 460,00'))
  it('bate', () => expect(projectionPhrase(0)).toBe('fecha no orçado'))
})

describe('summaryLines', () => {
  it('monta o texto do resumo', () => {
    const s = buildPacingSummary(input({}, [cat('m', 'estourado')]), 'Pessoal', 'https://app/budgets/pacing')
    expect(summaryLines(s)).toEqual([
      'floow · Pessoal — ritmo de setembro (dia 25 de 30)',
      'Orçado no mês: R$ 8.000,00',
      'Esperado até hoje: R$ 6.666,67',
      'Realizado até hoje: R$ 7.120,00 (107% do esperado)',
      'Projeção do mês: R$ 8.540,00 — estoura em R$ 540,00',
      'Mercado estourado',
      'Ver detalhes: https://app/budgets/pacing',
    ])
  })
})

describe('oneLine', () => {
  it('colapsa espaços, tabs e quebras', () => {
    expect(oneLine('  a\n\tb     c ')).toBe('a b c')
  })
})
