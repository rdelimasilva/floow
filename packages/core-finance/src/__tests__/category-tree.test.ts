import { describe, expect, it } from 'vitest'
import {
  buildParentIndex,
  resolveBudgetedCategory,
  rollUpToBudgetedCategories,
} from '../category-tree'

// "Alimentação" (raiz) com duas filhas da taxonomia da Polp.
const parentById = buildParentIndex([
  { id: 'food', parentId: null },
  { id: 'groceries', parentId: 'food' },
  { id: 'restaurant', parentId: 'food' },
  { id: 'transport', parentId: null },
])

function row(date: string, categoryId: string | null, cents: number, accountType = 'checking') {
  return { date, accountType, categoryId, cents }
}

describe('resolveBudgetedCategory', () => {
  it('conta o gasto da filha no teto que está na raiz', () => {
    // É o caso que motiva o arquivo: sem isso, um teto em "Alimentação" ignora
    // o supermercado e o orçamento parece intocado enquanto o dinheiro sai.
    const budgeted = new Set(['food'])
    expect(resolveBudgetedCategory('groceries', parentById, budgeted)).toBe('food')
  })

  it('respeita o teto posto na própria filha', () => {
    // Quem aperta o supermercado especificamente quer o teto ali, não na raiz.
    const budgeted = new Set(['food', 'groceries'])
    expect(resolveBudgetedCategory('groceries', parentById, budgeted)).toBe('groceries')
  })

  it('mantém a categoria original quando não há teto acima', () => {
    // O gasto continua aparecendo como "não orçado" na categoria certa, em vez
    // de sumir ou virar de outra.
    expect(resolveBudgetedCategory('groceries', parentById, new Set(['transport']))).toBe('groceries')
  })

  it('não inventa categoria para transação sem categoria', () => {
    expect(resolveBudgetedCategory(null, parentById, new Set(['food']))).toBeNull()
  })

  it('não trava num ciclo gravado por engano', () => {
    // Um ciclo em parent_id travaria o cron diário inteiro num laço infinito.
    const ciclico = buildParentIndex([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ])
    expect(resolveBudgetedCategory('a', ciclico, new Set(['sem-teto']))).toBe('a')
  })
})

describe('rollUpToBudgetedCategories', () => {
  it('soma as filhas do mesmo dia numa linha só da raiz orçada', () => {
    const rows = [row('2026-09-01', 'groceries', 5000), row('2026-09-01', 'restaurant', 3000)]

    const result = rollUpToBudgetedCategories(rows, parentById, new Set(['food']))

    expect(result).toEqual([{ date: '2026-09-01', accountType: 'checking', categoryId: 'food', cents: 8000 }])
  })

  it('não mistura dias nem tipos de conta diferentes', () => {
    // O motor conta gasto por dia e distingue conta de cartão; fundir isso
    // apagaria o ritmo, que é justamente o que ele mede.
    const rows = [
      row('2026-09-01', 'groceries', 5000),
      row('2026-09-02', 'groceries', 1000),
      row('2026-09-01', 'restaurant', 2000, 'credit_card'),
    ]

    const result = rollUpToBudgetedCategories(rows, parentById, new Set(['food']))

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.cents).sort((a, b) => a - b)).toEqual([1000, 2000, 5000])
  })

  it('deixa passar sem tocar o que já está na categoria do teto', () => {
    const rows = [row('2026-09-01', 'transport', 4000)]
    expect(rollUpToBudgetedCategories(rows, parentById, new Set(['transport']))).toEqual(rows)
  })

  it('não altera as linhas originais', () => {
    // O chamador reusa esse array; mutar em silêncio é bug de outro lugar.
    const rows = [row('2026-09-01', 'groceries', 5000)]
    rollUpToBudgetedCategories(rows, parentById, new Set(['food']))
    expect(rows[0].categoryId).toBe('groceries')
  })
})
