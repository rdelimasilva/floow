/**
 * Sugestão de meta de gasto a partir do histórico. Função pura.
 *
 * Para cada categoria principal sem meta: a mediana do gasto mensal nos meses
 * fechados da janela (até 12), arredondada para cima. Mediana e não média
 * para que uma compra grande isolada não infle a meta; mês sem gasto conta
 * como zero, então gasto esporádico (menos da metade dos meses) dá mediana
 * zero e não vira sugestão.
 */
import { isGenericCategory } from './category-suggestions'

export interface GoalSpendRow {
  categoryId: string | null
  /** YYYY-MM */
  month: string
  /** Gasto positivo, em centavos. */
  cents: number
}

export interface GoalCategory {
  id: string
  name: string
  parentId: string | null
}

export interface SuggestBudgetGoalsInput {
  rows: GoalSpendRow[]
  categories: GoalCategory[]
  /** Categorias com meta ativa (manual ou recorrente-como-meta). */
  categoriesWithGoal: Set<string>
  /** Meses fechados considerados, YYYY-MM. */
  months: string[]
}

export interface BudgetGoalSuggestion {
  categoryId: string
  suggestedCents: number
  medianCents: number
  monthsWithSpend: number
  monthsConsidered: number
}

export const GOAL_SUGGESTION_LIMITS = {
  minMonths: 3,
  minMedianCents: 5_000,
  maxSuggestions: 8,
} as const

/**
 * Meses fechados da janela, do mais antigo ao mais recente: até 12 antes do
 * mês de `hoje`, sem voltar antes do primeiro mês com gasto (conta nova não
 * pode ter meta puxada para baixo por meses que não existiam).
 */
export function goalWindowMonths(hoje: string, primeiroMesComGasto: string | null, max = 12): string[] {
  if (!primeiroMesComGasto) return []
  const [y, m] = hoje.split('-').map(Number)
  const meses: string[] = []
  for (let i = max; i >= 1; i--) {
    const d = new Date(y, m - 1 - i, 1)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (mes >= primeiroMesComGasto) meses.push(mes)
  }
  return meses
}

/** Degraus: até R$ 100 de R$ 10 em R$ 10; até R$ 1.000 de R$ 50; acima, de R$ 100. */
export function roundGoalUp(cents: number): number {
  const passo = cents < 10_000 ? 1_000 : cents < 100_000 ? 5_000 : 10_000
  return Math.ceil(cents / passo) * passo
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2)
}

export function suggestBudgetGoals(input: SuggestBudgetGoalsInput): BudgetGoalSuggestion[] {
  const L = GOAL_SUGGESTION_LIMITS
  if (input.months.length < L.minMonths) return []

  const porId = new Map(input.categories.map((c) => [c.id, c]))
  const raizDe = (id: string) => {
    const c = porId.get(id)
    return c?.parentId && porId.has(c.parentId) ? c.parentId : id
  }

  // Meta na principal ou em qualquer filha: o usuário já controla aquela área,
  // sugerir a principal contaria a filha duas vezes.
  const raizesComMeta = new Set([...input.categoriesWithGoal].filter((id) => porId.has(id)).map(raizDe))

  const indiceMes = new Map(input.months.map((m, i) => [m, i]))
  const series = new Map<string, number[]>()
  for (const r of input.rows) {
    if (!r.categoryId || !porId.has(r.categoryId)) continue
    const i = indiceMes.get(r.month)
    if (i === undefined) continue
    const raiz = raizDe(r.categoryId)
    if (raizesComMeta.has(raiz) || isGenericCategory({ ...porId.get(raiz)!, polpRef: null })) continue
    const serie = series.get(raiz) ?? new Array<number>(input.months.length).fill(0)
    serie[i] += r.cents
    series.set(raiz, serie)
  }

  const saida: BudgetGoalSuggestion[] = []
  for (const [categoryId, serie] of series) {
    const medianCents = mediana(serie)
    if (medianCents < L.minMedianCents) continue
    saida.push({
      categoryId,
      medianCents,
      suggestedCents: roundGoalUp(medianCents),
      monthsWithSpend: serie.filter((v) => v > 0).length,
      monthsConsidered: input.months.length,
    })
  }
  return saida.sort((a, b) => b.suggestedCents - a.suggestedCents).slice(0, L.maxSuggestions)
}
