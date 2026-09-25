import { describe, it, expect } from 'vitest'
import { estaEncerrada } from '@/lib/investments/encerrados'

describe('posição encerrada', () => {
  it('CDB do banco com saldo zero está encerrado, mesmo com quantidade', () => {
    expect(estaEncerrada({ currentValueCents: 0, quantityHeld: 1, source: 'openfinance' })).toBe(true)
    expect(estaEncerrada({ currentValueCents: 0, quantityHeld: 0, source: 'openfinance' })).toBe(true)
  })

  it('manual só encerra com quantidade zero — sem cotação ainda é carteira', () => {
    expect(estaEncerrada({ currentValueCents: 0, quantityHeld: 10, source: 'manual' })).toBe(false)
    expect(estaEncerrada({ currentValueCents: 0, quantityHeld: 0, source: 'manual' })).toBe(true)
  })

  it('com saldo nunca está encerrada', () => {
    expect(estaEncerrada({ currentValueCents: 1838677, quantityHeld: 1, source: 'openfinance' })).toBe(false)
  })
})
