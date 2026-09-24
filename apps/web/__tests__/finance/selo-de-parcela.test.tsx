import { describe, expect, it } from 'vitest'
import { textoDaParcela } from '@/components/finance/transaction-display-row'

describe('textoDaParcela', () => {
  it('parcela de cartão com data da compra', () => {
    expect(textoDaParcela({ installmentNumber: 3, installmentTotal: 6, purchaseDate: '2026-07-27' })).toBe('3/6 · compra em 27/07')
  })
  it('parcela manual, sem data da compra, não ganha selo', () => {
    expect(textoDaParcela({ installmentNumber: 3, installmentTotal: 61, purchaseDate: null })).toBeNull()
  })
  it('à vista, nada', () => {
    expect(textoDaParcela({ installmentNumber: null, installmentTotal: null, purchaseDate: null })).toBeNull()
  })
})
