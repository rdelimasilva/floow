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
