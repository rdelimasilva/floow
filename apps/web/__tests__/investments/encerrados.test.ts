import { describe, it, expect } from 'vitest'
import { estaEncerrada, posicoesDaCarteira } from '@/lib/investments/encerrados'

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

// Revisão de 18/10/2026: o Resumo somava os proventos de papel encerrado
// (R$ 28.738) e a tabela de posições, que esconde encerrados, não (R$ 28.408).
describe('posições da carteira', () => {
  const aberta = { currentValueCents: 1000, quantityHeld: 1, source: 'openfinance' as const, totalDividendsCents: 500 }
  const encerrada = { currentValueCents: 0, quantityHeld: 0, source: 'openfinance' as const, totalDividendsCents: 300 }

  it('o resumo usa as mesmas posições que a tabela mostra por padrão', () => {
    expect(posicoesDaCarteira([aberta, encerrada])).toEqual([aberta])
  })
})
