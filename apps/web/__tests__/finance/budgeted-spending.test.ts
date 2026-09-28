import { describe, it, expect } from 'vitest'
import { sumBudgetedSpending } from '@/lib/finance/budgeted-spending'

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
