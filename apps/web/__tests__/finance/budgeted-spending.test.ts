import { describe, it, expect } from 'vitest'
import { sumBudgetedSpending, rollUpSpendingToBudgeted } from '@/lib/finance/budgeted-spending'

describe('sumBudgetedSpending', () => {
  it('soma só as categorias com meta, ignorando as sem meta e sem categoria', () => {
    const spending = [
      { categoryId: 'mercado', spent: 50_000 },
      { categoryId: 'imovel', spent: 16_000_000 },
      { categoryId: null, spent: 900_000 },
      { categoryId: 'lazer', spent: 20_000 },
    ]
    const entries = [{ categoryId: 'mercado' }, { categoryId: 'lazer' }]
    expect(sumBudgetedSpending(spending, entries)).toBe(70_000)
  })

  it('sem metas, o gasto considerado é zero', () => {
    expect(sumBudgetedSpending([{ categoryId: 'x', spent: 100 }], [])).toBe(0)
  })
})

describe('rollUpSpendingToBudgeted', () => {
  const categories = [
    { id: 'alimentacao', parentId: null },
    { id: 'mercado', parentId: 'alimentacao' },
    { id: 'restaurante', parentId: 'alimentacao' },
    { id: 'lazer', parentId: null },
    { id: 'cinema', parentId: 'lazer' },
  ]

  it('soma o gasto das filhas na categoria-mãe que tem meta', () => {
    const spending = [
      { categoryId: 'mercado', spent: 30_000 },
      { categoryId: 'restaurante', spent: 20_000 },
      { categoryId: 'alimentacao', spent: 5_000 },
    ]
    const r = rollUpSpendingToBudgeted(spending, categories, [{ categoryId: 'alimentacao' }])
    expect(r).toEqual([{ categoryId: 'alimentacao', spent: 55_000 }])
  })

  it('filha com meta própria fica com o próprio gasto', () => {
    const spending = [
      { categoryId: 'mercado', spent: 30_000 },
      { categoryId: 'restaurante', spent: 20_000 },
    ]
    const r = rollUpSpendingToBudgeted(spending, categories, [
      { categoryId: 'alimentacao' },
      { categoryId: 'mercado' },
    ])
    expect(r).toEqual([
      { categoryId: 'mercado', spent: 30_000 },
      { categoryId: 'alimentacao', spent: 20_000 },
    ])
  })

  it('gasto sem meta na árvore continua na própria categoria, e sem categoria continua null', () => {
    const spending = [
      { categoryId: 'cinema', spent: 4_000 },
      { categoryId: null, spent: 1_000 },
    ]
    const r = rollUpSpendingToBudgeted(spending, categories, [{ categoryId: 'alimentacao' }])
    expect(r).toEqual([
      { categoryId: 'cinema', spent: 4_000 },
      { categoryId: null, spent: 1_000 },
    ])
  })
})
