// apps/web/__tests__/openfinance/parcelas-previstas.test.ts
import { describe, expect, it } from 'vitest'
import { camposDaOcupacao, dataFinalDaParcela } from '@/lib/openfinance/parcelas-previstas'

describe('dataFinalDaParcela', () => {
  it('à vista: mantém a data', () => {
    expect(dataFinalDaParcela({ date: '2026-09-12', purchaseDate: null, billPostDate: null, billForecastMonth: '2026-10' }, 16)).toBe('2026-09-12')
  })
  it('parcela sem fatura fechada: usa o dia de vencimento do cartão', () => {
    expect(dataFinalDaParcela({ date: '2027-03-01', purchaseDate: '2026-09-12', billPostDate: null, billForecastMonth: '2027-03' }, 16)).toBe('2027-03-16')
  })
  it('parcela com fatura: vencimento da fatura', () => {
    expect(dataFinalDaParcela({ date: '2026-12-16', purchaseDate: '2026-09-12', billPostDate: '2026-12-16', billForecastMonth: '2026-12' }, 10)).toBe('2026-12-16')
  })
})

describe('camposDaOcupacao', () => {
  const hoje = new Date('2026-10-20T15:00:00Z')

  it('parcela real já vencida ocupa a previsão entrando no saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-3', amountCents: -45916, description: 'AIRBNB 03/06', date: '2026-10-16', categoryId: 'cat' }, hoje)
    expect(c.balanceApplied).toBe(true)
    expect(c.isInstallmentForecast).toBe(false)
    expect(c.externalId).toBe('polp-3')
    expect(c.date.toISOString().slice(0, 10)).toBe('2026-10-16')
  })

  it('parcela real futura ocupa a previsão fora do saldo', () => {
    const c = camposDaOcupacao({ externalId: 'polp-4', amountCents: -45916, description: 'AIRBNB 04/06', date: '2026-11-16', categoryId: null }, hoje)
    expect(c.balanceApplied).toBe(false)
    expect('categoryId' in c).toBe(false) // categoria da previsão fica
  })
})
