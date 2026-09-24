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
  /** Teto de sugestões devolvidas. Padrão: SUGGESTION_LIMITS.maxSuggestions. */
  limit?: number
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
  /**
   * Categoria que já existe e para onde o grupo deveria ir (aceitar move, não
   * cria). Null = sugere categoria nova, com nome a decidir.
   */
  targetCategoryId: string | null
  /** Até 3 descrições distintas do grupo, para quem for nomear a categoria. */
  samples: string[]
}

export const SUGGESTION_LIMITS = {
  minCount: 6,
  minMonths: 3,
  minTotalCents: 30_000,
  minCountForTotal: 2,
  splitMinShare: 0.1,
  splitMinGroups: 2,
  maxSuggestions: 10,
  /** Candidatas enviadas ao classificador, que descarta parte delas. */
  maxCandidates: 30,
  windowMonths: 12,
  /** Lançamentos já classificados que bastam para apontar a categoria de destino. */
  targetMinCount: 2,
  /** Fatia mínima da categoria mais usada entre os já classificados. */
  targetMinShare: 0.6,
  maxSamples: 3,
} as const

/**
 * Categoria genérica (balaio): nome "Outros"/"Outras", exato ou seguido de
 * espaço ("Outras contas e serviços"). Decide pelo nome, não pelo polpRef: a
 * categoria da Polp que o usuário renomeou ("Assistente de limpeza", com
 * polpRef ..._OTHER_...) virou categoria de verdade.
 */
export function isGenericCategory(c: SuggestionCategory): boolean {
  const nome = normalizeCategoryName(c.name)
  return nome === 'outros' || nome === 'outras' || nome.startsWith('outros ') || nome.startsWith('outras ')
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
    targetCategoryId: null,
    samples: [...new Set(g.txs.map((t) => t.description.trim()))].slice(0, SUGGESTION_LIMITS.maxSamples),
  }
}

/**
 * Para cada chave, a categoria específica onde o usuário já costuma pôr
 * aquele estabelecimento/pessoa. "TED enviada jussara…" em "Assistente de
 * limpeza" diz para onde vão os "PIX TRANSF JUSSARA" sem categoria.
 */
function destinosPorHistorico(
  txs: SuggestionTransaction[],
  especifica: (id: string | null) => boolean,
): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>()
  for (const t of txs) {
    if (!especifica(t.categoryId)) continue
    const key = normalizeMerchant(t.description)
    if (!key) continue
    const porCat = contagem.get(key) ?? new Map<string, number>()
    porCat.set(t.categoryId!, (porCat.get(t.categoryId!) ?? 0) + 1)
    contagem.set(key, porCat)
  }
  const destinos = new Map<string, string>()
  for (const [key, porCat] of contagem) {
    const total = [...porCat.values()].reduce((a, b) => a + b, 0)
    const [catId, n] = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0]
    if (n >= SUGGESTION_LIMITS.targetMinCount && n / total >= SUGGESTION_LIMITS.targetMinShare) destinos.set(key, catId)
  }
  return destinos
}

export function suggestCategories(input: SuggestCategoriesInput): CategorySuggestion[] {
  const L = SUGGESTION_LIMITS
  const porId = new Map(input.categories.map((c) => [c.id, c]))
  const nomesExistentes = new Set(
    [...input.categories.map((c) => c.name), ...(input.existingNames ?? [])].map(normalizeCategoryName),
  )
  const generica = (id: string | null) => id === null || (porId.has(id) && isGenericCategory(porId.get(id)!))
  const especifica = (id: string | null) => id !== null && porId.has(id) && !generica(id)
  const porNomeExistente = new Map(
    input.categories.filter((c) => !isGenericCategory(c)).map((c) => [normalizeCategoryName(c.name), c]),
  )
  const destinos = destinosPorHistorico(input.transactions, especifica)

  const saida: CategorySuggestion[] = []

  // Tipo A: gasto em "Sem categoria" / genérica
  for (const g of agrupar(input.transactions.filter((t) => generica(t.categoryId)))) {
    if (!qualifica(g)) continue
    const origens = [...new Set(g.txs.map((t) => t.categoryId).filter((id): id is string => id !== null))]
    const s = montar('uncategorized', g, null, origens)
    // Destino: primeiro o histórico do próprio usuário; senão, uma categoria
    // que já tem o nome que seria sugerido ("Ifood" com "iFood" existindo).
    const alvo = porId.get(destinos.get(g.key) ?? '') ?? porNomeExistente.get(normalizeCategoryName(s.suggestedName))
    if (alvo) {
      s.targetCategoryId = alvo.id
      s.suggestedName = alvo.name
    }
    saida.push(s)
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
    // Nome repetido só importa para quem vai criar categoria.
    .filter((s) => s.targetCategoryId !== null || !nomesExistentes.has(normalizeCategoryName(s.suggestedName)))

  return dedupePorNome(filtradas)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, input.limit ?? L.maxSuggestions)
}

/**
 * Mesmo nome novo em duas sugestões (tipo A e B, dois splits, ou dois grupos
 * que o classificador batizou igual): aceitar uma faria a outra falhar por
 * nome repetido. Fica a de maior total. Quem move para categoria existente
 * não entra na disputa: duas pessoas podem ir para a mesma categoria.
 */
export function dedupePorNome(sugestoes: CategorySuggestion[]): CategorySuggestion[] {
  const porNome = new Map<string, CategorySuggestion>()
  const comAlvo: CategorySuggestion[] = []
  for (const s of sugestoes) {
    if (s.targetCategoryId !== null) {
      comAlvo.push(s)
      continue
    }
    const nome = normalizeCategoryName(s.suggestedName)
    const atual = porNome.get(nome)
    if (!atual || s.totalCents > atual.totalCents) porNome.set(nome, s)
  }
  return [...comAlvo, ...porNome.values()]
}
