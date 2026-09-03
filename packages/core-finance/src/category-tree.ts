/**
 * Hierarquia de categorias — a parte que decide onde o gasto é contado.
 *
 * A taxonomia da Polp tem dois níveis: `FOOD_AND_DRINK` é raiz e
 * `FOOD_AND_DRINK_GROCERIES` é filha. Um teto posto em "Alimentação" precisa
 * captar o que cai nas filhas, senão o orçamento passa a mentir de um jeito
 * silencioso: o gasto existe, aparece no extrato, e o teto continua intocado
 * porque a categoria da transação não é literalmente a categoria do teto.
 *
 * `computeBudgetPacing` NÃO sabe disso e não deve saber — ele recebe
 * `{ categoryId, plannedCents }` e casa por id. Quem resolve a soma das filhas
 * é quem monta a entrada, e é esta função.
 */

/** O mínimo que a resolução precisa saber sobre uma categoria. */
export interface CategoryParentRef {
  id: string
  parentId: string | null
}

/** Índice id -> pai, para subir a árvore sem consultar o banco de novo. */
export function buildParentIndex(categories: CategoryParentRef[]): Map<string, string | null> {
  return new Map(categories.map((c) => [c.id, c.parentId]))
}

/**
 * A categoria em que este gasto deve ser contado, dado o conjunto das que têm
 * teto.
 *
 * Sobe a árvore até achar uma categoria orçada. Sem nenhuma, devolve a própria
 * categoria da transação — que é o que faz o gasto continuar aparecendo como
 * "não orçado" no lugar certo, em vez de sumir.
 *
 * A subida é limitada: uma categoria que seja pai de si mesma, ou um ciclo
 * gravado por engano, travaria o cron diário inteiro num laço.
 */
export function resolveBudgetedCategory(
  categoryId: string | null,
  parentById: Map<string, string | null>,
  budgetedIds: Set<string>,
  maxDepth = 8,
): string | null {
  if (categoryId === null) return null

  let current: string | null = categoryId
  const visited = new Set<string>()

  for (let depth = 0; depth < maxDepth && current !== null; depth++) {
    if (budgetedIds.has(current)) return current
    if (visited.has(current)) break
    visited.add(current)
    current = parentById.get(current) ?? null
  }

  return categoryId
}

/**
 * Reatribui as linhas de gasto diário à categoria que carrega o teto.
 *
 * Só agrupa o que precisa: linhas cuja categoria já é a orçada passam
 * inalteradas. Linhas do mesmo dia, mesma conta e mesma categoria resultante são
 * somadas, para o motor não receber duas linhas equivalentes.
 */
export function rollUpToBudgetedCategories<
  T extends { date: string; accountType: string; categoryId: string | null; cents: number },
>(rows: T[], parentById: Map<string, string | null>, budgetedIds: Set<string>): T[] {
  const merged = new Map<string, T>()

  for (const row of rows) {
    const categoryId = resolveBudgetedCategory(row.categoryId, parentById, budgetedIds)
    const key = `${row.date}|${row.accountType}|${categoryId ?? ''}`
    const existing = merged.get(key)

    if (existing) {
      existing.cents += row.cents
    } else {
      merged.set(key, { ...row, categoryId })
    }
  }

  return [...merged.values()]
}
