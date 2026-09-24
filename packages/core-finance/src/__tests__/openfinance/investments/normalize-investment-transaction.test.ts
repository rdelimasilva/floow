import { describe, it, expect } from 'vitest'
import { normalizeInvestmentTransaction } from '../../../openfinance/investments/normalize-investment-transaction'

const money = (amount: string) => ({ amount, currency: 'BRL' })

describe('normalizeInvestmentTransaction', () => {
  it('aplicação em CDB: custo é o bruto', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-1', type: 'ENTRADA', transaction_type: 'APLICACAO', transaction_date: '2025-03-10',
      transaction_quantity: '10', transaction_unit_price: money('1000.00'),
      transaction_gross_value: money('10000.00'), transaction_net_value: money('10000.00'),
      income_tax: money('0'),
    })
    expect(r).toEqual({
      polpTransactionId: 'tx-1', eventType: 'buy', unknownType: null, eventDate: '2025-03-10',
      quantity: 10, unitPrice: 1000, priceCents: 100000, totalCents: 1000000,
      grossCents: 1000000, netCents: 1000000, incomeTaxCents: 0, notes: null,
    })
  })

  it('resgate: total é o líquido que caiu na conta', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-2', transaction_type: 'RESGATE', transaction_date: '2026-03-10', transaction_quantity: '10',
      transaction_gross_value: money('11200.00'), transaction_net_value: money('10980.00'), income_tax: money('220.00'),
    })
    expect(r).toMatchObject({ eventType: 'sell', totalCents: 1098000, grossCents: 1120000, incomeTaxCents: 22000 })
  })

  it('fundo: data de conversão, cotas e preço da cota', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-3', transaction_type: 'APLICACAO', transaction_conversion_date: '2026-02-02',
      transaction_quota_quantity: '398.1234567', transaction_quota_price: money('2.5117'),
      transaction_value: money('1000.00'),
    })
    expect(r.eventDate).toBe('2026-02-02')
    expect(r.quantity).toBeCloseTo(398.1234567, 7)
    expect(r.priceCents).toBe(251)
    expect(r.totalCents).toBe(100000)
  })

  it('come-cotas: quantidade de cotas e total = IR', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-4', transaction_type: 'COME_COTAS', transaction_conversion_date: '2026-05-29',
      transaction_quota_quantity: '3.21', income_tax: money('8.07'),
    })
    expect(r).toMatchObject({ eventType: 'come_cotas', quantity: 3.21, totalCents: 807 })
  })

  it('JCP em renda variável usa transaction_value', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-5', transaction_type: 'JCP', transaction_date: '2026-08-15', transaction_value: money('42.50'),
    })
    expect(r).toMatchObject({ eventType: 'jcp', totalCents: 4250, quantity: null })
  })

  it('tipo novo vira other, guarda o cru e a nota', () => {
    const r = normalizeInvestmentTransaction({
      id: 'tx-6', transaction_type: 'BONIFICACAO', transaction_type_additional_info: 'bonus 10%',
      transaction_date: '2026-01-05', transaction_quantity: '5',
    })
    expect(r).toMatchObject({ eventType: 'other', unknownType: 'BONIFICACAO', notes: 'bonus 10%' })
  })

  it('sem id ou sem data é erro', () => {
    expect(() => normalizeInvestmentTransaction({ transaction_type: 'COMPRA', transaction_date: '2026-01-01' })).toThrow(/sem id/)
    expect(() => normalizeInvestmentTransaction({ id: 'x', transaction_type: 'COMPRA' })).toThrow(/sem data/)
  })
})
