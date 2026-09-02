import { describe, it, expect } from 'vitest'
import { analyzeBudgetPacing } from '../../cfo/analyzers/budget-pacing'
import { computeBudgetPacing } from '../../budget-pacing'
import type { DailySpendRow } from '../../budget-pacing'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0))

const row = (day: number, categoryId: string, cents: number): DailySpendRow => ({
  date: `2026-09-${String(day).padStart(2, '0')}`,
  accountType: 'credit_card',
  categoryId,
  cents,
})

const NAMES = { alim: 'Alimentação', lazer: 'Lazer', moradia: 'Moradia' }

function analyze(daily: DailySpendRow[], budgets: { categoryId: string; plannedCents: number }[], today: Date) {
  const pacing = computeBudgetPacing({ daily, budgets, monthStart: utc(2026, 9, 1), today })
  return analyzeBudgetPacing({ pacing, categoryNames: NAMES, month: '2026-09' })
}

describe('analyzeBudgetPacing', () => {
  it('não gera insight para mês futuro', () => {
    const pacing = computeBudgetPacing({
      daily: [],
      budgets: [{ categoryId: 'alim', plannedCents: 100000 }],
      monthStart: utc(2026, 12, 1),
      today: utc(2026, 9, 12),
    })
    expect(analyzeBudgetPacing({ pacing, categoryNames: NAMES, month: '2026-12' })).toEqual([])
  })

  it('gera insight de estouro quando o gasto já passou o teto', () => {
    const out = analyze([row(5, 'lazer', 60000)], [{ categoryId: 'lazer', plannedCents: 50000 }], utc(2026, 9, 12))
    const exceeded = out.find((i) => i.type === 'budget_pacing_exceeded')

    expect(exceeded).toBeDefined()
    expect(exceeded!.title).toContain('Lazer')
    expect(exceeded!.metric.spentCents).toBe(60000)
    expect(exceeded!.metric.pct).toBe(120)
    expect(exceeded!.severity).toBe('warning')
  })

  it('marca como critical quando o estouro passa de 120%', () => {
    const out = analyze([row(5, 'lazer', 70000)], [{ categoryId: 'lazer', plannedCents: 50000 }], utc(2026, 9, 12))
    expect(out.find((i) => i.type === 'budget_pacing_exceeded')!.severity).toBe('critical')
  })

  it('avisa antes do estouro quando a projeção é confiável', () => {
    // 120000 em 12 dias -> projeta 300000 contra teto 250000 = risco.
    const out = analyze([row(5, 'alim', 120000)], [{ categoryId: 'alim', plannedCents: 250000 }], utc(2026, 9, 12))
    const risk = out.find((i) => i.type === 'budget_pacing_risk')

    expect(risk).toBeDefined()
    expect(risk!.title).toContain('Alimentação')
    expect(risk!.metric.projectedCents).toBe(300000)
    expect(risk!.severity).toBe('warning')
    // Ainda não estourou de fato, então nenhum insight de estouro.
    expect(out.some((i) => i.type === 'budget_pacing_exceeded')).toBe(false)
  })

  it('silencia o alerta preditivo antes do dia 7, quando a projeção é ruído', () => {
    // Mesmo perfil de risco, porém no dia 3: confidence 'low'.
    const out = analyze([row(2, 'alim', 30000)], [{ categoryId: 'alim', plannedCents: 250000 }], utc(2026, 9, 3))
    expect(out.some((i) => i.type === 'budget_pacing_risk')).toBe(false)
    expect(out.some((i) => i.type === 'budget_pacing_month_over')).toBe(false)
  })

  it('reporta estouro consumado mesmo com confiança baixa', () => {
    // Dia 3, mas o gasto já passou o teto: fato, não previsão.
    const out = analyze([row(2, 'lazer', 60000)], [{ categoryId: 'lazer', plannedCents: 50000 }], utc(2026, 9, 3))
    expect(out.some((i) => i.type === 'budget_pacing_exceeded')).toBe(true)
  })

  it('não gera nada quando tudo está dentro do ritmo', () => {
    // 60000 em 12 dias -> projeta 150000 contra teto 250000.
    const out = analyze([row(5, 'alim', 60000)], [{ categoryId: 'alim', plannedCents: 250000 }], utc(2026, 9, 12))
    expect(out).toEqual([])
  })

  it('emite um resumo do mês quando o total projetado estoura', () => {
    const out = analyze(
      [row(5, 'alim', 120000)],
      [
        { categoryId: 'alim', plannedCents: 250000 },
        { categoryId: 'moradia', plannedCents: 20000 },
      ],
      utc(2026, 9, 12),
    )
    const summary = out.find((i) => i.type === 'budget_pacing_month_over')

    expect(summary).toBeDefined()
    expect(summary!.metric.projectedCents).toBe(300000)
    expect(summary!.metric.plannedCents).toBe(270000)
    expect(summary!.suggestedAction).toEqual({ type: 'view_pacing', params: { month: '2026-09' } })
  })

  it('usa um rótulo legível quando a categoria não tem nome mapeado', () => {
    const pacing = computeBudgetPacing({
      daily: [row(5, 'desconhecida', 60000)],
      budgets: [{ categoryId: 'desconhecida', plannedCents: 50000 }],
      monthStart: utc(2026, 9, 1),
      today: utc(2026, 9, 12),
    })
    const out = analyzeBudgetPacing({ pacing, categoryNames: {}, month: '2026-09' })
    expect(out[0].title).toContain('Categoria sem nome')
  })
})
