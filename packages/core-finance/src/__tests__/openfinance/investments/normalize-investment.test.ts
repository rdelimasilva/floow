import { describe, it, expect } from 'vitest'
import { normalizeInvestment } from '../../../openfinance/investments/normalize-investment'

const money = (amount: string) => ({ amount, currency: 'BRL' })

describe('normalizeInvestment — renda fixa bancária', () => {
  const cdb = {
    id: 'bfi-1',
    investment_type: 'CDB',
    issuer_institution_cnpj_number: '60701190000104',
    isin_code: 'BRITAUCDB001',
    due_date: '2027-05-10',
    remuneration: { indexer: 'CDI', post_fixed_indexer_percentage: '1.100000', pre_fixed_rate: null },
    balance: {
      reference_date_time: '2026-09-22T03:00:00Z',
      quantity: '10.000000',
      updated_unit_price: money('1123.456789'),
      gross_amount: money('11234.57'),
      net_amount: money('11020.10'),
      income_tax: money('190.12'),
      financial_transaction_tax: money('24.35'),
      blocked_balance: money('0.00'),
      purchase_unit_price: money('1000.00'),
    },
  }

  it('identidade, remuneração e nome legível', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', cdb)
    expect(r.polpId).toBe('bfi-1')
    expect(r.asset).toEqual({
      name: 'CDB Itaú 110% CDI · venc. 05/2027',
      ticker: null,
      assetClass: 'fixed_income',
      assetSubtype: 'CDB',
      isin: 'BRITAUCDB001',
      cnpj: '60701190000104',
      issuerName: 'Itaú',
      indexer: 'CDI',
      preFixedRate: null,
      indexerPercentage: 1.1,
      dueDate: '2027-05-10',
    })
  })

  it('posição do banco em centavos e decimais', () => {
    expect(normalizeInvestment('BANK_FIXED_INCOME', cdb).position).toEqual({
      referenceDate: '2026-09-22',
      quantity: 10,
      unitPrice: 1123.456789,
      grossCents: 1123457,
      netCents: 1102010,
      incomeTaxCents: 19012,
      iofCents: 2435,
      blockedCents: 0,
      purchaseUnitPrice: 1000,
    })
  })

  it('emissor pela raiz do CNPJ, com ou sem pontuação', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', { ...cdb, issuer_institution_cnpj_number: '30.306.294/0002-26' })
    expect(r.asset.issuerName).toBe('BTG Pactual')
  })

  it('emissor desconhecido: sem nome, CNPJ guardado', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', { ...cdb, issuer_institution_cnpj_number: '12345678000199' })
    expect(r.asset.issuerName).toBeNull()
    expect(r.asset.cnpj).toBe('12345678000199')
    expect(r.asset.name).toBe('CDB 110% CDI · venc. 05/2027')
  })

  it('balance nulo: posição nula, ativo continua', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', { ...cdb, balance: null })
    expect(r.position).toBeNull()
    expect(r.asset.assetSubtype).toBe('CDB')
  })

  it('prefixado descreve a taxa ao ano', () => {
    const r = normalizeInvestment('BANK_FIXED_INCOME', {
      ...cdb, remuneration: { indexer: 'PRE_FIXADO', pre_fixed_rate: '0.125000' },
    })
    expect(r.asset.name).toBe('CDB Itaú 12,5% a.a. · venc. 05/2027')
    expect(r.asset.preFixedRate).toBeCloseTo(0.125)
  })
})

describe('normalizeInvestment — crédito, Tesouro, fundo, renda variável', () => {
  it('debênture com escala "100" e devedor', () => {
    const r = normalizeInvestment('CREDIT_FIXED_INCOME', {
      id: 'cfi-1', investment_type: 'DEBENTURES', debtor_name: 'Energia SA',
      due_date: '2030-01-15', remuneration: { indexer: 'IPCA', pre_fixed_rate: '0.065' }, balance: null,
    })
    expect(r.asset.assetClass).toBe('credit_fixed_income')
    expect(r.asset.issuerName).toBe('Energia SA')
    expect(r.asset.name).toBe('DEBENTURES Energia SA IPCA + 6,5% · venc. 01/2030')
  })

  it('Tesouro usa o nome do produto', () => {
    const r = normalizeInvestment('TREASURE_TITLE', {
      id: 'tt-1', product_name: 'Tesouro IPCA+ 2035', due_date: '2035-05-15',
      remuneration: { indexer: 'IPCA' }, balance: null,
    })
    expect(r.asset.name).toBe('Tesouro IPCA+ 2035')
    expect(r.asset.assetClass).toBe('treasury')
  })

  it('fundo: cotas, reference_date e provisões', () => {
    const r = normalizeInvestment('FUND', {
      id: 'f-1', name: 'Fundo XP DI', cnpj_number: '11222333000144',
      balance: {
        reference_date: '2026-09-21', quota_quantity: '1234.5678901234',
        quota_gross_price_value: money('2.5123456'), gross_amount: money('3101.62'),
        net_amount: money('3050.00'), income_tax_provision: money('51.62'),
        financial_transaction_tax_provision: null, blocked_amount: null,
      },
    })
    expect(r.asset).toMatchObject({ name: 'Fundo XP DI', cnpj: '11222333000144', assetClass: 'fund' })
    expect(r.position).toMatchObject({
      referenceDate: '2026-09-21', grossCents: 310162, netCents: 305000, incomeTaxCents: 5162, iofCents: null, purchaseUnitPrice: null,
    })
    expect(r.position!.quantity).toBeCloseTo(1234.5678901234, 10)
  })

  it('renda variável: ticker, sem líquido nem IR', () => {
    const r = normalizeInvestment('VARIABLE_INCOME', {
      id: 'vi-1', ticker: 'PETR4', isin_code: 'BRPETRACNPR6',
      balance: { reference_date: '2026-09-22', quantity: '100', closing_price: money('38.50'), gross_amount: money('3850.00') },
    })
    expect(r.asset).toMatchObject({ ticker: 'PETR4', name: 'PETR4', assetClass: 'br_equity' })
    expect(r.position).toMatchObject({ quantity: 100, unitPrice: 38.5, grossCents: 385000, netCents: null, incomeTaxCents: null })
  })

  it('sem id é erro — é a chave de tudo que vem depois', () => {
    expect(() => normalizeInvestment('FUND', { name: 'x' })).toThrow(/sem id/)
  })

  it('balance sem data de referência não vira posição', () => {
    expect(normalizeInvestment('FUND', { id: 'f', name: 'x', balance: { quota_quantity: '1' } }).position).toBeNull()
  })
})
