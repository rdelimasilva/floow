import { describe, it, expect } from 'vitest'
import {
  suggestCategories, isGenericCategory, type SuggestionTransaction, type SuggestionCategory,
} from '../category-suggestions'

const CATS: SuggestionCategory[] = [
  { id: 'outros', name: 'Outros', parentId: null, polpRef: 'OTHER' },
  { id: 'outros-serv', name: 'Outros serviços gerais', parentId: 'serv', polpRef: 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES' },
  { id: 'alim', name: 'Alimentação', parentId: null, polpRef: null },
  { id: 'casa', name: 'Casa', parentId: null, polpRef: null },
]

let seq = 0
function tx(description: string, reais: number, month: number, categoryId: string | null): SuggestionTransaction {
  const mm = String(month).padStart(2, '0')
  return { id: `t${seq++}`, description, amountCents: -reais * 100, date: `2026-${mm}-10`, categoryId }
}
/** n lançamentos, um por mês a partir de janeiro. */
function serie(description: string, reais: number, n: number, categoryId: string | null) {
  return Array.from({ length: n }, (_, i) => tx(description, reais, (i % 12) + 1, categoryId))
}
const base = { categories: CATS, categoriesWithGoal: new Set<string>(), excludedFingerprints: new Set<string>() }

describe('isGenericCategory', () => {
  it('Outros raiz e filhas "Outros ..." são genéricas', () => {
    expect(isGenericCategory(CATS[0])).toBe(true)
    expect(isGenericCategory(CATS[1])).toBe(true)
    expect(isGenericCategory(CATS[2])).toBe(false)
  })
})

describe('suggestCategories — tipo A', () => {
  it('sugere grupo recorrente sem categoria', () => {
    const r = suggestCategories({ ...base, transactions: serie('IFOOD *REST', 40, 6, null) })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      kind: 'uncategorized', suggestedName: 'Ifood', merchantKey: 'ifood', matchValue: 'ifood',
      parentCategoryId: null, sourceCategoryIds: [], txCount: 6, totalCents: 24000, monthlyAvgCents: 2000,
      fingerprint: 'uncategorized:root:ifood',
    })
  })
  it('junta "Sem categoria" e "Outros" no mesmo grupo e guarda a origem', () => {
    const txs = [...serie('IFOOD *A', 40, 3, null), ...serie('IFOOD *B', 40, 3, 'outros')]
    const [s] = suggestCategories({ ...base, transactions: txs })
    expect(s.txCount).toBe(6)
    expect(s.sourceCategoryIds).toEqual(['outros'])
  })
  it('6 lançamentos em só 2 meses não bastam', () => {
    const txs = [...Array(3)].flatMap(() => [tx('Padaria Pao', 10, 1, null), tx('Padaria Pao', 10, 2, null)])
    expect(suggestCategories({ ...base, transactions: txs })).toEqual([])
  })
  it('R$ 300 com 2 lançamentos basta; compra única grande não', () => {
    expect(suggestCategories({ ...base, transactions: [tx('KABUM LOJA', 2000, 1, null)] })).toEqual([])
    expect(suggestCategories({ ...base, transactions: [tx('KABUM LOJA', 200, 1, null), tx('KABUM LOJA', 200, 5, null)] })).toHaveLength(1)
  })
  it('ignora lançamento já em categoria específica', () => {
    expect(suggestCategories({ ...base, transactions: serie('IFOOD', 40, 6, 'alim') })).toEqual([])
  })
  it('ignora descrição genérica', () => {
    expect(suggestCategories({ ...base, transactions: serie('PIX ENVIADO 123', 400, 6, null) })).toEqual([])
  })
})

describe('suggestCategories — tipo B', () => {
  const grande = [...serie('IFOOD *X', 50, 6, 'alim'), ...serie('PADARIA BELA', 30, 6, 'alim')]
  const pequeno = serie('LEROY MERLIN', 10, 1, 'casa')

  it('divide categoria grande sem meta em subcategorias', () => {
    const r = suggestCategories({ ...base, transactions: [...grande, ...pequeno] })
    expect(r.map((s) => s.fingerprint).sort()).toEqual(['split:alim:ifood', 'split:alim:padaria'])
    expect(r[0]).toMatchObject({ kind: 'split', parentCategoryId: 'alim', sourceCategoryIds: ['alim'] })
  })
  it('categoria com meta não é dividida', () => {
    expect(suggestCategories({ ...base, categoriesWithGoal: new Set(['alim']), transactions: grande })).toEqual([])
  })
  it('um único grupo qualificado não justifica dividir', () => {
    expect(suggestCategories({ ...base, transactions: serie('IFOOD *X', 50, 6, 'alim') })).toEqual([])
  })
  it('categoria abaixo de 10% do total não é dividida', () => {
    const outra = serie('ALUGUEL IMOVEL', 5000, 12, 'casa')
    expect(suggestCategories({ ...base, transactions: [...grande, ...outra] }).filter((s) => s.parentCategoryId === 'alim')).toEqual([])
  })
})

describe('suggestCategories — filtros finais', () => {
  it('não sugere nome que já existe (caixa/acento)', () => {
    const cats = [...CATS, { id: 'x', name: 'IFÓOD', parentId: null, polpRef: null }]
    expect(suggestCategories({ ...base, categories: cats, transactions: serie('IFOOD', 40, 6, null) })).toEqual([])
  })
  it('fingerprint excluído não volta', () => {
    const excl = new Set(['uncategorized:root:ifood'])
    expect(suggestCategories({ ...base, excludedFingerprints: excl, transactions: serie('IFOOD', 40, 6, null) })).toEqual([])
  })
  it('ordena por total e corta em 10', () => {
    const nomes = ['alfaaa', 'betaaa', 'gamaaa', 'deltaa', 'epsilo', 'zetaaa', 'etaaaa', 'tetaaa', 'iotaaa', 'kapaaa', 'lambda', 'musica']
    const txs = nomes.flatMap((n, i) => serie(n.toUpperCase(), 10 + i, 6, null))
    const r = suggestCategories({ ...base, transactions: txs })
    expect(r).toHaveLength(10)
    expect(r[0].merchantKey).toBe('musica')
    expect(r.map((s) => s.totalCents)).toEqual([...r.map((s) => s.totalCents)].sort((a, b) => b - a))
  })
})
