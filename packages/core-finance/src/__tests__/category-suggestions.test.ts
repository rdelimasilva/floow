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
  it('polpRef com _OTHER_ no meio é genérica (taxonomia real)', () => {
    expect(isGenericCategory({ id: 'x', name: 'Outras contas e serviços', parentId: 'contas', polpRef: 'RENT_AND_UTILITIES_OTHER_UTILITIES' })).toBe(true)
  })
  it('nome "Outrasmarcas" sem espaço não é genérica', () => {
    expect(isGenericCategory({ id: 'x', name: 'Outrasmarcas', parentId: null, polpRef: null })).toBe(false)
  })
  // Categoria da Polp renomeada pelo usuário deixa de ser balaio: "Outros
  // serviços de casa" virou "Assistente de limpeza" e é destino legítimo.
  it('categoria da Polp renomeada não é genérica, mesmo com _OTHER_ no polpRef', () => {
    expect(isGenericCategory({ id: 'x', name: 'Assistente de limpeza', parentId: 'casa', polpRef: 'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT' })).toBe(false)
    expect(isGenericCategory({ id: 'x', name: 'Casa', parentId: null, polpRef: 'OTHER' })).toBe(false)
  })
  it('com polpRef null, nome "Outros gastos" é genérica', () => {
    expect(isGenericCategory({ id: 'x', name: 'Outros gastos', parentId: null, polpRef: null })).toBe(true)
  })
  it('com polpRef null, nome "Outras" é genérica', () => {
    expect(isGenericCategory({ id: 'x', name: 'Outras', parentId: null, polpRef: null })).toBe(true)
  })
  it('com polpRef null, nome "Outras contas" é genérica', () => {
    expect(isGenericCategory({ id: 'x', name: 'Outras contas', parentId: null, polpRef: null })).toBe(true)
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
  it('dividir uma subcategoria sugere irmã dela, não neta (mãe = mãe da origem)', () => {
    const cats = [...CATS, { id: 'mercado', name: 'Mercado', parentId: 'alim', polpRef: null }]
    const txs = [...serie('IFOOD *X', 50, 6, 'mercado'), ...serie('PADARIA BELA', 30, 6, 'mercado')]
    const r = suggestCategories({ ...base, categories: cats, transactions: txs })
    expect(r).toHaveLength(2)
    for (const s of r) expect(s).toMatchObject({ kind: 'split', parentCategoryId: 'alim', sourceCategoryIds: ['mercado'] })
    expect(r.map((s) => s.fingerprint).sort()).toEqual(['split:alim:ifood', 'split:alim:padaria'])
  })
  it('categoria abaixo de 10% do total não é dividida', () => {
    const outra = serie('ALUGUEL IMOVEL', 5000, 12, 'casa')
    expect(suggestCategories({ ...base, transactions: [...grande, ...outra] }).filter((s) => s.parentCategoryId === 'alim')).toEqual([])
  })
})

describe('suggestCategories — filtros finais', () => {
  it('nome igual a categoria existente (caixa/acento) vira mover para ela', () => {
    const cats = [...CATS, { id: 'x', name: 'IFÓOD', parentId: null, polpRef: null }]
    const r = suggestCategories({ ...base, categories: cats, transactions: serie('IFOOD', 40, 6, null) })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ targetCategoryId: 'x', suggestedName: 'IFÓOD' })
  })
  it('não sugere nome que já existe em categoria de outro tipo (existingNames)', () => {
    const r = suggestCategories({ ...base, existingNames: ['iFood'], transactions: serie('IFOOD', 40, 6, null) })
    expect(r).toEqual([])
  })
  it('mesmo nome sugerido duas vezes (tipo A e tipo B) fica só o de maior total', () => {
    const txs = [
      ...serie('IFOOD *X', 50, 6, 'alim'), ...serie('PADARIA BELA', 30, 6, 'alim'),
      ...serie('IFOOD *Y', 20, 6, null),
    ]
    const r = suggestCategories({ ...base, transactions: txs })
    const ifood = r.filter((s) => s.suggestedName === 'Ifood')
    expect(ifood).toHaveLength(1)
    expect(ifood[0]).toMatchObject({ kind: 'split', totalCents: 30000 })
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

describe('suggestCategories — categoria que já existe', () => {
  const LIMPEZA = { id: 'limpeza', name: 'Assistente de limpeza', parentId: null, polpRef: null }
  const cats = [...CATS, LIMPEZA]

  it('pessoa que já tem lançamentos numa categoria: sugere mover para ela', () => {
    const txs = [
      ...serie('TED enviada jussara leoncio de andrade', 3500, 3, 'limpeza'),
      ...serie('PIX TRANSF JUSSARA01 01', 3300, 6, null),
    ]
    const r = suggestCategories({ ...base, categories: cats, transactions: txs })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      kind: 'uncategorized', targetCategoryId: 'limpeza', suggestedName: 'Assistente de limpeza',
      merchantKey: 'jussara', txCount: 6, fingerprint: 'uncategorized:root:jussara',
    })
  })

  it('um lançamento só na categoria não basta para decidir', () => {
    const txs = [...serie('TED jussara', 3500, 1, 'limpeza'), ...serie('PIX TRANSF JUSSARA01', 3300, 6, null)]
    const [s] = suggestCategories({ ...base, categories: cats, transactions: txs })
    expect(s.targetCategoryId).toBeNull()
  })

  it('histórico dividido entre categorias não decide', () => {
    const txs = [
      ...serie('PIX jussara', 3500, 2, 'limpeza'),
      ...serie('PIX jussara', 3500, 2, 'alim'),
      ...serie('PIX TRANSF JUSSARA01', 3300, 6, null),
    ]
    const [s] = suggestCategories({ ...base, categories: cats, transactions: txs })
    expect(s.targetCategoryId).toBeNull()
  })

  it('sem histórico: sem alvo, com até 3 descrições de exemplo', () => {
    const txs = [...serie('Pix enviado Maraisa Ramos', 500, 3, null), ...serie('PIX TRANSF Maraisa05 01', 500, 3, null)]
    const [s] = suggestCategories({ ...base, categories: cats, transactions: txs })
    expect(s.targetCategoryId).toBeNull()
    expect(s.samples.length).toBeGreaterThan(0)
    expect(s.samples.length).toBeLessThanOrEqual(3)
    expect(new Set(s.samples).size).toBe(s.samples.length)
  })

  it('duas pessoas indo para a mesma categoria existente não se anulam', () => {
    const txs = [
      ...serie('TED jussara', 3500, 3, 'limpeza'),
      ...serie('PIX TRANSF JUSSARA01', 3300, 6, null),
      ...serie('TED marlene', 3500, 3, 'limpeza'),
      ...serie('PIX TRANSF MARLENE01', 3300, 6, null),
    ]
    const r = suggestCategories({ ...base, categories: cats, transactions: txs }).filter((s) => s.kind === 'uncategorized')
    expect(r.map((s) => s.merchantKey).sort()).toEqual(['jussara', 'marlene'])
    expect(r.every((s) => s.targetCategoryId === 'limpeza')).toBe(true)
  })
})
