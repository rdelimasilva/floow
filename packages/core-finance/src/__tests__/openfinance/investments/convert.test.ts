import { describe, it, expect } from 'vitest'
import { moneyCents, decimal, toFraction, dateOnly, mapEventType } from '../../../openfinance/investments/convert'

describe('moneyCents', () => {
  it('lê o objeto da Polp e a string solta', () => {
    expect(moneyCents({ amount: '1500.25', currency: 'BRL' })).toBe(150025)
    expect(moneyCents('10.5')).toBe(1050)
  })
  it('ausência é null, não zero', () => {
    expect(moneyCents(null)).toBeNull()
    expect(moneyCents(undefined)).toBeNull()
  })
  it('valor ilegível é erro — NaN no saldo é pior que item rejeitado', () => {
    expect(() => moneyCents({ amount: 'abc' })).toThrow()
  })
})

describe('decimal', () => {
  it('preserva casas de cota e preço unitário', () => {
    expect(decimal('12.3456789012')).toBeCloseTo(12.3456789012, 10)
    expect(decimal({ amount: '1.23456789' })).toBeCloseTo(1.23456789, 8)
  })
  it('null e string vazia viram null', () => {
    expect(decimal(null)).toBeNull()
    expect(decimal('')).toBeNull()
  })
  it('lixo é erro', () => {
    expect(() => decimal('1,5')).toThrow()
  })
})

describe('toFraction', () => {
  it('as duas escalas da doc viram fração', () => {
    expect(toFraction('1.000000')).toBe(1)
    expect(toFraction('100')).toBe(1)
    expect(toFraction('1.10')).toBeCloseTo(1.1)
    expect(toFraction('110')).toBeCloseTo(1.1)
    expect(toFraction('0.150000')).toBeCloseTo(0.15)
  })
  it('null segue null', () => {
    expect(toFraction(null)).toBeNull()
  })
})

describe('dateOnly', () => {
  it('data pura passa; timestamp vira data de São Paulo', () => {
    expect(dateOnly('2027-05-10')).toBe('2027-05-10')
    expect(dateOnly('2026-01-31T23:30:00-03:00')).toBe('2026-01-31')
    expect(dateOnly(null)).toBeNull()
  })
})

describe('mapEventType', () => {
  it.each([
    ['APLICACAO', 'buy'], ['COMPRA', 'buy'],
    ['RESGATE', 'sell'], ['VENDA', 'sell'], ['CANCELAMENTO', 'sell'],
    ['VENCIMENTO', 'maturity'],
    ['PAGAMENTO_JUROS', 'interest'], ['PREMIO', 'interest'],
    ['AMORTIZACAO', 'amortization'],
    ['DIVIDENDOS', 'dividend'], ['ALUGUEIS', 'dividend'],
    ['JCP', 'jcp'], ['COME_COTAS', 'come_cotas'],
    ['MULTA', 'other'], ['MORA', 'other'], ['OUTROS', 'other'],
    ['TRANSFERENCIA_TITULARIDADE', 'other'], ['TRANSFERENCIA_CUSTODIA', 'other'], ['TRANSFERENCIA_COTAS', 'other'],
  ])('%s → %s (conhecido)', (raw, expected) => {
    expect(mapEventType(raw)).toEqual({ eventType: expected, known: true })
  })
  it('valor novo vira other e é sinalizado como desconhecido', () => {
    expect(mapEventType('BONIFICACAO')).toEqual({ eventType: 'other', known: false })
    expect(mapEventType(null)).toEqual({ eventType: 'other', known: false })
  })
})
