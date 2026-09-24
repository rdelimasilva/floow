import { describe, it, expect } from 'vitest'
import {
  applyClassifications,
  type CategorySuggestion,
  type SuggestionCategory,
} from '../category-suggestions'

const CATS: SuggestionCategory[] = [
  { id: 'outros', name: 'Outros', parentId: null, polpRef: 'OTHER' },
  { id: 'limpeza', name: 'Assistente de limpeza', parentId: null, polpRef: null },
  { id: 'alim', name: 'Alimentação', parentId: null, polpRef: null },
]

function sug(fingerprint: string, over: Partial<CategorySuggestion> = {}): CategorySuggestion {
  return {
    kind: 'uncategorized', fingerprint, suggestedName: 'Maraisa', parentCategoryId: null,
    sourceCategoryIds: [], merchantKey: 'maraisa', matchValue: 'maraisa', txCount: 6,
    totalCents: 10000, monthlyAvgCents: 833, targetCategoryId: null, samples: ['Pix enviado Maraisa'], ...over,
  }
}

describe('applyClassifications', () => {
  it('sem decisão, a sugestão sem destino some', () => {
    expect(applyClassifications([sug('a')], [], CATS)).toEqual([])
  })

  it('ignorar tira a sugestão', () => {
    expect(applyClassifications([sug('a')], [{ fingerprint: 'a', action: 'ignore' }], CATS)).toEqual([])
  })

  it('existente vira mover para a categoria', () => {
    const [r] = applyClassifications([sug('a')], [{ fingerprint: 'a', action: 'existing', categoryId: 'limpeza' }], CATS)
    expect(r).toMatchObject({ targetCategoryId: 'limpeza', suggestedName: 'Assistente de limpeza' })
  })

  it('existente inválida (id inventado ou genérica) é descartada', () => {
    const d = [
      { fingerprint: 'a', action: 'existing' as const, categoryId: 'nao-existe' },
      { fingerprint: 'b', action: 'existing' as const, categoryId: 'outros' },
    ]
    expect(applyClassifications([sug('a'), sug('b')], d, CATS)).toEqual([])
  })

  it('não sugere mover para a própria categoria de origem', () => {
    const s = sug('a', { kind: 'split', sourceCategoryIds: ['alim'], parentCategoryId: 'alim' })
    expect(applyClassifications([s], [{ fingerprint: 'a', action: 'existing', categoryId: 'alim' }], CATS)).toEqual([])
  })

  it('nova usa o nome do classificador', () => {
    const [r] = applyClassifications([sug('a')], [{ fingerprint: 'a', action: 'new', name: ' Diarista ' }], CATS)
    expect(r).toMatchObject({ suggestedName: 'Diarista', targetCategoryId: null })
  })

  it('nova com nome de categoria existente vira mover para ela', () => {
    const [r] = applyClassifications([sug('a')], [{ fingerprint: 'a', action: 'new', name: 'assistente de LIMPEZA' }], CATS)
    expect(r).toMatchObject({ targetCategoryId: 'limpeza' })
  })

  it('nova com nome de categoria de outro tipo, vazio ou longo demais é descartada', () => {
    const d = [
      { fingerprint: 'a', action: 'new' as const, name: 'Salário' },
      { fingerprint: 'b', action: 'new' as const, name: '   ' },
      { fingerprint: 'c', action: 'new' as const, name: 'x'.repeat(41) },
    ]
    expect(applyClassifications([sug('a'), sug('b'), sug('c')], d, CATS, ['Salário'])).toEqual([])
  })

  it('dois grupos batizados com o mesmo nome novo: fica o de maior total', () => {
    const d = [
      { fingerprint: 'a', action: 'new' as const, name: 'Delivery' },
      { fingerprint: 'b', action: 'new' as const, name: 'delivery' },
    ]
    const r = applyClassifications([sug('a', { totalCents: 100 }), sug('b', { totalCents: 900 })], d, CATS)
    expect(r.map((s) => s.fingerprint)).toEqual(['b'])
  })

  it('sugestão que já tinha destino passa direto', () => {
    const s = sug('a', { targetCategoryId: 'limpeza', suggestedName: 'Assistente de limpeza' })
    expect(applyClassifications([s], [], CATS)).toEqual([s])
  })
})
