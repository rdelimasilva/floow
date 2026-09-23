/**
 * Mantém as filhas penduradas na mãe quando a mãe de sistema vira cópia da org.
 *
 * Renomear/editar categoria de sistema faz copy-on-write (`category-actions`):
 * a org ganha uma cópia e a original fica escondida para ela. As filhas
 * continuavam com `parentId` na original escondida — a árvore não achava a mãe
 * e a filha aparecia recuada debaixo de outra raiz qualquer, e o rollup de
 * orçamento por raiz perdia a filha.
 *
 * Aqui só se DECIDE; quem grava é `category-actions`. Módulo puro.
 */

interface CategoriaNo {
  id: string
  orgId: string | null
  parentId: string | null
  polpRef: string | null
}

interface Entrada {
  orgId: string
  /** O que a org enxerga: as dela e as de sistema não escondidas. */
  visiveis: CategoriaNo[]
  /** As de sistema que a org escondeu (por cópia ou por exclusão). */
  escondidas: CategoriaNo[]
  /** Original de sistema → cópia da org, quando se sabe (na hora do rename). */
  copiasConhecidas?: Map<string, string>
}

export interface PlanoDeHierarquia {
  /** Filha da própria org: basta trocar o `parentId`. */
  reapontar: { categoriaId: string; parentId: string }[]
  /** Filha de sistema: a org ganha a cópia dela já pendurada na mãe nova. */
  copiar: { categoriaId: string; parentId: string }[]
}

export function planejarHierarquia({ orgId, visiveis, escondidas, copiasConhecidas }: Entrada): PlanoDeHierarquia {
  const plano: PlanoDeHierarquia = { reapontar: [], copiar: [] }
  if (escondidas.length === 0) return plano

  // A cópia herda o `polpRef` da original — é o vínculo que sobra quando o
  // rename foi feito antes desta correção. Toda mãe de sistema com filhas vem
  // da taxonomia da Polp, então tem `polpRef`.
  const copiaPorPolpRef = new Map<string, string>()
  for (const c of visiveis) {
    if (c.orgId === orgId && c.polpRef) copiaPorPolpRef.set(c.polpRef, c.id)
  }

  const copiaDe = new Map<string, string>()
  for (const e of escondidas) {
    const copia = copiasConhecidas?.get(e.id) ?? (e.polpRef ? copiaPorPolpRef.get(e.polpRef) : undefined)
    if (copia) copiaDe.set(e.id, copia)
  }

  for (const c of visiveis) {
    const novaMae = c.parentId ? copiaDe.get(c.parentId) : undefined
    if (!novaMae || novaMae === c.id) continue
    const passo = { categoriaId: c.id, parentId: novaMae }
    if (c.orgId === orgId) plano.reapontar.push(passo)
    else if (c.orgId === null) plano.copiar.push(passo)
  }

  return plano
}
