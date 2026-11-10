import { describe, it, expect } from 'vitest'
import { acumular } from '../mercado/acumulado'

describe('acumular', () => {
  it('compõe as taxas em vez de somar', () => {
    expect(acumular([1, 1])).toBeCloseTo(0.0201, 10)
  })

  it('lista vazia não rende nada', () => {
    expect(acumular([])).toBe(0)
  })

  it('252 dias do CDI de 05/11/2026 dão cerca de 13,65% no ano', () => {
    expect(acumular(Array(252).fill(0.050788))).toBeCloseTo(0.1365, 4)
  })

  it('aceita mês negativo no IPCA', () => {
    expect(acumular([0.5, -0.2, 0.3])).toBeCloseTo(0.005999, 6)
  })
})
