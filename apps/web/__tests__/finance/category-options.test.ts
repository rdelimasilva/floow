import { describe, expect, it } from 'vitest'
import { categoryLabel, sortCategoryTree, toCategoryOptions } from '@/lib/finance/category-options'

const alimentacao = { id: 'food', name: 'Alimentação', parentId: null }
const supermercado = { id: 'groceries', name: 'Supermercado', parentId: 'food' }
const restaurante = { id: 'restaurant', name: 'Restaurantes', parentId: 'food' }
const transporte = { id: 'transport', name: 'Transporte', parentId: null }

describe('sortCategoryTree', () => {
  it('põe cada filha logo abaixo do próprio pai', () => {
    // Em ordem alfabética achatada, "Supermercado" cairia depois de
    // "Transporte" e o usuário não veria que ela pertence a "Alimentação".
    const sorted = sortCategoryTree([transporte, supermercado, alimentacao, restaurante])

    expect(sorted.map((c) => c.id)).toEqual(['food', 'restaurant', 'groceries', 'transport'])
  })

  it('não engole a filha cujo pai foi filtrado da lista', () => {
    // Os seletores filtram por tipo antes de ordenar. Sumir do seletor é pior
    // que aparecer no nível errado.
    const sorted = sortCategoryTree([supermercado, transporte])

    expect(sorted.map((c) => c.id)).toEqual(['groceries', 'transport'])
  })

  it('lida com lista vazia sem reclamar', () => {
    expect(sortCategoryTree([])).toEqual([])
  })
})

describe('categoryLabel', () => {
  it('indenta a filha e deixa a raiz em paz', () => {
    expect(categoryLabel(alimentacao)).toBe('Alimentação')
    expect(categoryLabel(supermercado)).toMatch(/Supermercado$/)
    expect(categoryLabel(supermercado)).not.toBe('Supermercado')
  })
})

describe('toCategoryOptions', () => {
  it('preserva os demais campos da categoria', () => {
    // Os seletores usam type para filtrar e id para o value; perder qualquer um
    // deles quebraria o formulário em silêncio.
    const options = toCategoryOptions([{ ...alimentacao, type: 'expense' }])

    expect(options[0]).toMatchObject({ id: 'food', type: 'expense', label: 'Alimentação' })
  })
})
