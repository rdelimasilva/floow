/**
 * Apresentação da hierarquia de categorias nos seletores.
 *
 * A taxonomia da Polp entra com dois níveis e ~145 categorias de sistema. Em
 * ordem alfabética achatada, "Supermercado" aparece a dezenas de linhas de
 * "Alimentação", e o usuário não tem como saber que uma está dentro da outra —
 * a lista fica correta e ilegível ao mesmo tempo.
 *
 * Aqui a ordem é de árvore (cada raiz seguida das próprias filhas) e a filha vem
 * indentada. É o mínimo para a lista continuar navegável; busca é outro assunto.
 */

export interface CategoryLike {
  id: string
  name: string
  parentId?: string | null
}

/** Espaço não-quebrável: sobrevive tanto no <option> nativo quanto no Select. */
const INDENT = '   '

/**
 * Ordena as categorias em ordem de árvore: raízes por nome, cada uma seguida
 * das suas filhas, também por nome.
 *
 * Filha cujo pai não está na lista (filtrada por tipo, por exemplo) não some:
 * é tratada como raiz, porque desaparecer do seletor é pior que aparecer fora
 * do lugar.
 */
export function sortCategoryTree<T extends CategoryLike>(categories: T[]): T[] {
  const byName = (a: CategoryLike, b: CategoryLike) => a.name.localeCompare(b.name, 'pt-BR')
  const present = new Set(categories.map((c) => c.id))

  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []

  for (const category of categories) {
    const parentId = category.parentId
    if (parentId && present.has(parentId)) {
      const siblings = childrenOf.get(parentId)
      if (siblings) siblings.push(category)
      else childrenOf.set(parentId, [category])
    } else {
      roots.push(category)
    }
  }

  return roots.sort(byName).flatMap((root) => [root, ...(childrenOf.get(root.id) ?? []).sort(byName)])
}

/** Rótulo do seletor: a filha aparece indentada sob o pai. */
export function categoryLabel(category: CategoryLike): string {
  return category.parentId ? `${INDENT}${category.name}` : category.name
}

/** Ordena e já devolve `{ id, label }` — o que a maioria dos seletores usa. */
export function toCategoryOptions<T extends CategoryLike>(categories: T[]): (T & { label: string })[] {
  return sortCategoryTree(categories).map((category) => ({ ...category, label: categoryLabel(category) }))
}
