/**
 * Categorias que podem ser mãe de uma categoria criada por sugestão: só raiz de
 * despesa. `sortCategoryTree` (category-options.ts) só desenha dois níveis, então
 * uma neta sumiria dos seletores e de /categories. O aceite valida o mesmo no
 * servidor (accept.ts).
 */
export interface CategoriaParaMae {
  id: string
  name: string
  type: string
  parentId?: string | null
}

export function opcoesDeCategoriaMae(categorias: CategoriaParaMae[]): { id: string; name: string }[] {
  return categorias
    .filter((c) => c.type === 'expense' && !c.parentId)
    .map((c) => ({ id: c.id, name: c.name }))
}
