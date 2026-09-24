import { describe, it, expect } from 'vitest'
import { suggestBudgetGoals, roundGoalUp, goalWindowMonths, type GoalSpendRow } from '../budget-goal-suggestions'

const CATS = [
  { id: 'casa', name: 'Casa', parentId: null },
  { id: 'limpeza', name: 'Assistente de limpeza', parentId: 'casa' },
  { id: 'saude', name: 'Saúde', parentId: null },
  { id: 'viagem', name: 'Viagens', parentId: null },
  { id: 'outros', name: 'Outros', parentId: null },
]
const MESES = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']

/** Uma linha por mês com o mesmo valor (em reais). */
function todoMes(categoryId: string, reais: number, meses = MESES): GoalSpendRow[] {
  return meses.map((month) => ({ categoryId, month, cents: reais * 100 }))
}

const base = { categories: CATS, categoriesWithGoal: new Set<string>(), months: MESES }

describe('roundGoalUp', () => {
  it('arredonda para cima em degraus que dependem do tamanho', () => {
    expect(roundGoalUp(8_730)).toBe(9_000) // R$ 87,30 -> R$ 90
    expect(roundGoalUp(123_700)).toBe(130_000) // R$ 1.237 -> R$ 1.300
    expect(roundGoalUp(45_100)).toBe(50_000) // R$ 451 -> R$ 500
    expect(roundGoalUp(100_000)).toBe(100_000)
  })
})

describe('suggestBudgetGoals', () => {
  it('sugere a mediana mensal arredondada para cima', () => {
    const rows = [...todoMes('saude', 400), { categoryId: 'saude', month: '2026-03', cents: 900_000 }]
    const [s] = suggestBudgetGoals({ ...base, rows })
    // meses: 400,400,400,400,400, (400+9000) -> mediana 400: a compra grande isolada não infla
    expect(s).toMatchObject({ categoryId: 'saude', medianCents: 40_000, suggestedCents: 40_000, monthsWithSpend: 6 })
  })

  it('soma as filhas na categoria principal', () => {
    const rows = [...todoMes('casa', 1000), ...todoMes('limpeza', 350)]
    const [s] = suggestBudgetGoals({ ...base, rows })
    expect(s).toMatchObject({ categoryId: 'casa', medianCents: 135_000 })
  })

  it('gasto esporádico (menos da metade dos meses) não vira meta', () => {
    const rows = todoMes('viagem', 3000, ['2025-12', '2026-02'])
    expect(suggestBudgetGoals({ ...base, rows })).toEqual([])
  })

  it('categoria com meta, ou com filha com meta, fica de fora', () => {
    const rows = [...todoMes('casa', 1000), ...todoMes('saude', 400)]
    const comMetaNaFilha = suggestBudgetGoals({ ...base, rows, categoriesWithGoal: new Set(['limpeza']) })
    expect(comMetaNaFilha.map((s) => s.categoryId)).toEqual(['saude'])
    const comMetaNaMae = suggestBudgetGoals({ ...base, rows, categoriesWithGoal: new Set(['casa']) })
    expect(comMetaNaMae.map((s) => s.categoryId)).toEqual(['saude'])
  })

  it('ignora sem categoria, categoria genérica e valores irrisórios', () => {
    const rows = [
      ...todoMes('outros', 900),
      ...MESES.map((month) => ({ categoryId: null, month, cents: 90_000 })),
      ...todoMes('saude', 30),
    ]
    expect(suggestBudgetGoals({ ...base, rows })).toEqual([])
  })

  it('menos de 3 meses de histórico não sugere nada', () => {
    const meses = ['2026-02', '2026-03']
    expect(suggestBudgetGoals({ ...base, months: meses, rows: todoMes('saude', 400, meses) })).toEqual([])
  })

  it('ordena do maior para o menor e ignora linha fora dos meses da janela', () => {
    const rows = [...todoMes('saude', 400), ...todoMes('casa', 1000), { categoryId: 'saude', month: '2024-01', cents: 9_999_999 }]
    expect(suggestBudgetGoals({ ...base, rows }).map((s) => s.categoryId)).toEqual(['casa', 'saude'])
  })
})

describe('goalWindowMonths', () => {
  it('12 meses fechados antes do mês atual, atravessando o ano', () => {
    const m = goalWindowMonths('2026-01-15', '2020-01')
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2025-01')
    expect(m[11]).toBe('2025-12')
  })
  it('não volta antes do primeiro mês com gasto', () => {
    expect(goalWindowMonths('2026-09-24', '2026-06')).toEqual(['2026-06', '2026-07', '2026-08'])
  })
  it('sem gasto nenhum, janela vazia', () => {
    expect(goalWindowMonths('2026-09-24', null)).toEqual([])
  })
})
