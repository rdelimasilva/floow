/**
 * Sugestão de categorias a partir dos gastos de 12 meses. Função pura.
 * Ver docs/superpowers/specs/2026-09-24-sugestao-de-categorias-design.md.
 */
import { normalizeCategoryName, normalizeMerchant, ruleTermFor } from './merchant-key'

export type SuggestionKind = 'uncategorized' | 'split'

export interface SuggestionTransaction {
  id: string
  description: string
  /** Negativo = saída, como em `transactions.amount_cents`. */
  amountCents: number
  /** YYYY-MM-DD */
  date: string
  categoryId: string | null
}

export interface SuggestionCategory {
  id: string
  name: string
  parentId: string | null
  polpRef: string | null
}

export interface SuggestCategoriesInput {
  transactions: SuggestionTransaction[]
  categories: SuggestionCategory[]
  /**
   * Nomes de categorias de qualquer tipo (receita, transferência...). O aceite
   * recusa nome repetido em qualquer tipo; sem isto o motor sugeriria um nome
   * que só daria erro ao aceitar.
   */
  existingNames?: string[]
  categoriesWithGoal: Set<string>
  /** Fingerprints recusados ou já aceitos: nunca voltam. */
  excludedFingerprints: Set<string>
}

export interface CategorySuggestion {
  kind: SuggestionKind
  fingerprint: string
  suggestedName: string
  parentCategoryId: string | null
  sourceCategoryIds: string[]
  merchantKey: string
  matchValue: string | null
  txCount: number
  totalCents: number
  monthlyAvgCents: number
}

export const SUGGESTION_LIMITS = {
  minCount: 6,
  minMonths: 3,
  minTotalCents: 30_000,
  minCountForTotal: 2,
  splitMinShare: 0.1,
  splitMinGroups: 2,
  maxSuggestions: 10,
  windowMonths: 12,
} as const

/**
 * Detecta categoria genérica (catch-all buckets): polpRef com padrão OTHER ou
 * nome normalizado com "outros"/"outras" (exato ou com espaço).
 */
export function isGenericCategory(c: SuggestionCategory): boolean {
  const nome = normalizeCategoryName(c.name)
  const hasOtherPattern = c.polpRef?.includes('_OTHER_') ?? false
  return c.polpRef === 'OTHER' || hasOtherPattern || nome === 'outros' || nome === 'outras' || nome.startsWith('outros ') || nome.startsWith('outras ')
}

interface Grupo {
  key: string
  txs: SuggestionTransaction[]
  totalCents: number
  meses: Set<string>
}

function agrupar(txs: SuggestionTransaction[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const t of txs) {
    const key = normalizeMerchant(t.description)
    if (!key) continue
    const g = grupos.get(key) ?? { key, txs: [], totalCents: 0, meses: new Set<string>() }
    g.txs.push(t)
    g.totalCents += -t.amountCents
    g.meses.add(t.date.slice(0, 7))
    grupos.set(key, g)
  }
  return [...grupos.values()]
}

function qualifica(g: Grupo): boolean {
  const L = SUGGESTION_LIMITS
  const recorrente = g.txs.length >= L.minCount && g.meses.size >= L.minMonths
  const relevante = g.totalCents >= L.minTotalCents && g.txs.length >= L.minCountForTotal
  return recorrente || relevante
}

function titleCase(key: string): string {
  return key.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

function montar(kind: SuggestionKind, g: Grupo, parentId: string | null, sources: string[]): CategorySuggestion {
  return {
    kind,
    fingerprint: `${kind}:${parentId ?? 'root'}:${g.key}`,
    suggestedName: titleCase(g.key),
    parentCategoryId: parentId,
    sourceCategoryIds: sources,
    merchantKey: g.key,
    matchValue: ruleTermFor(g.key, g.txs.map((t) => t.description)),
    txCount: g.txs.length,
    totalCents: g.totalCents,
    monthlyAvgCents: Math.round(g.totalCents / SUGGESTION_LIMITS.windowMonths),
  }
}

export function suggestCategories(input: SuggestCategoriesInput): CategorySuggestion[] {
  const L = SUGGESTION_LIMITS
  const porId = new Map(input.categories.map((c) => [c.id, c]))
  const nomesExistentes = new Set(
    [...input.categories.map((c) => c.name), ...(input.existingNames ?? [])].map(normalizeCategoryName),
  )
  const generica = (id: string | null) => id === null || (porId.has(id) && isGenericCategory(porId.get(id)!))

  const saida: CategorySuggestion[] = []

  // Tipo A: gasto em "Sem categoria" / genérica
  for (const g of agrupar(input.transactions.filter((t) => generica(t.categoryId)))) {
    if (!qualifica(g)) continue
    const origens = [...new Set(g.txs.map((t) => t.categoryId).filter((id): id is string => id !== null))]
    saida.push(montar('uncategorized', g, null, origens))
  }

  // Tipo B: categoria específica grande, sem meta, com 2+ grupos relevantes
  const totalGeral = input.transactions.reduce((s, t) => s + -t.amountCents, 0)
  const porCategoria = new Map<string, SuggestionTransaction[]>()
  for (const t of input.transactions) {
    if (generica(t.categoryId) || !porId.has(t.categoryId!)) continue
    const lista = porCategoria.get(t.categoryId!) ?? []
    lista.push(t)
    porCategoria.set(t.categoryId!, lista)
  }
  for (const [catId, txs] of porCategoria) {
    if (input.categoriesWithGoal.has(catId) || totalGeral <= 0) continue
    const gasto = txs.reduce((s, t) => s + -t.amountCents, 0)
    if (gasto / totalGeral < L.splitMinShare) continue
    const grupos = agrupar(txs).filter(qualifica)
    if (grupos.length < L.splitMinGroups) continue
    // A nova categoria nasce irmã da origem quando a origem já é subcategoria:
    // os seletores só mostram dois níveis, uma neta sumiria da tela.
    const mae = porId.get(catId)!.parentId ?? catId
    for (const g of grupos) saida.push(montar('split', g, mae, [catId]))
  }

  const filtradas = saida
    .filter((s) => !input.excludedFingerprints.has(s.fingerprint))
    .filter((s) => !nomesExistentes.has(normalizeCategoryName(s.suggestedName)))

  // Mesmo nome em duas sugestões (tipo A e B, ou dois splits): aceitar uma
  // faria a outra falhar por nome repetido. Fica a de maior total.
  const porNome = new Map<string, CategorySuggestion>()
  for (const s of filtradas) {
    const nome = normalizeCategoryName(s.suggestedName)
    const atual = porNome.get(nome)
    if (!atual || s.totalCents > atual.totalCents) porNome.set(nome, s)
  }

  return [...porNome.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, L.maxSuggestions)
}
