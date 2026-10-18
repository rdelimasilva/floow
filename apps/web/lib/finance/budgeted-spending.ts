import {
  buildParentIndex,
  resolveBudgetedCategory,
  type CategoryParentRef,
} from '@floow/core-finance/src/category-tree'

/**
 * Gasto do mês no mesmo universo do orçado: só as categorias que TÊM meta.
 * Somar todas as despesas inflava o total com gasto que o usuário nunca se
 * propôs a controlar (e disparava "Metas em risco" com valores absurdos).
 */
export function sumBudgetedSpending(
  spending: { categoryId: string | null; spent: number }[],
  entries: { categoryId: string | null }[],
): number {
  const budgeted = new Set(entries.map((e) => e.categoryId))
  return spending
    .filter((s) => s.categoryId !== null && budgeted.has(s.categoryId))
    .reduce((sum, s) => sum + s.spent, 0)
}

/**
 * Leva o gasto das subcategorias para a categoria que tem a meta: compra em
 * "Mercado" consome a meta de "Alimentação". É a mesma regra do Ritmo de
 * Gastos (rollUpToBudgetedCategories), para as telas contarem igual.
 */
export function rollUpSpendingToBudgeted(
  spending: { categoryId: string | null; spent: number }[],
  categories: CategoryParentRef[],
  entries: { categoryId: string | null }[],
): { categoryId: string | null; spent: number }[] {
  const parentIndex = buildParentIndex(categories)
  const budgeted = new Set(entries.map((e) => e.categoryId).filter((id): id is string => id !== null))
  const merged = new Map<string | null, number>()
  for (const s of spending) {
    const categoryId = resolveBudgetedCategory(s.categoryId, parentIndex, budgeted)
    merged.set(categoryId, (merged.get(categoryId) ?? 0) + s.spent)
  }
  return [...merged].map(([categoryId, spent]) => ({ categoryId, spent }))
}
