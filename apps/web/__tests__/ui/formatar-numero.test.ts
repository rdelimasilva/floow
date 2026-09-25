import { describe, it, expect } from 'vitest'
import { formatarNumero } from '@/lib/formatar-numero'

/** `toFixed` sai no formato americano: "12.34%" numa tela em pt-BR. */
describe('formatarNumero', () => {
  it('usa vírgula decimal e o número de casas pedido', () => {
    expect(formatarNumero(12.345, 2)).toBe('12,35')
    expect(formatarNumero(7, 1)).toBe('7,0')
  })

  it('agrupa milhares com ponto', () => {
    expect(formatarNumero(1234.5, 1)).toBe('1.234,5')
  })
})
