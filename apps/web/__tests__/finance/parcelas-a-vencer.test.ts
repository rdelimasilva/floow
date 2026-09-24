import { describe, expect, it } from 'vitest'
import { livreDaCategoria, somarParcelasPorCategoria } from '@/lib/finance/parcelas-a-vencer'

describe('somarParcelasPorCategoria', () => {
  it('soma por categoria e guarda as parcelas', () => {
    const r = somarParcelasPorCategoria([
      { categoryId: 'casa', description: 'Westwing', installmentNumber: 2, installmentTotal: 6, amountCents: 28023 },
      { categoryId: 'casa', description: 'ITAUSHOP', installmentNumber: 2, installmentTotal: 10, amountCents: 5581 },
      { categoryId: 'viagem', description: 'AIRBNB', installmentNumber: 3, installmentTotal: 6, amountCents: 45916 },
    ])
    expect(r.casa.totalCents).toBe(33604)
    expect(r.casa.parcelas).toHaveLength(2)
    expect(r.viagem.totalCents).toBe(45916)
  })
})

describe('livreDaCategoria', () => {
  it('meta menos gasto menos parcelas a vencer', () => {
    expect(livreDaCategoria(100000, 30000, 28000)).toBe(42000)
  })
  it('fica negativo quando as parcelas passam da meta', () => {
    expect(livreDaCategoria(20000, 0, 28000)).toBe(-8000)
  })
})
