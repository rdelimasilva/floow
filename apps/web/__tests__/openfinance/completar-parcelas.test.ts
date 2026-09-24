import { describe, expect, it } from 'vitest'
import { linhaDaPrevisao } from '@/lib/openfinance/completar-parcelas'

describe('linhaDaPrevisao', () => {
  const linha = linhaDaPrevisao(
    { purchaseDate: '2026-07-27', installmentNumber: 3, installmentTotal: 6, amountCents: -45916, date: '2026-10-16', description: 'AIRBNB * HMR5PP9B9', categoryId: 'cat' },
    { orgId: 'org', accountId: 'acc' },
  )

  it('nunca entra no saldo e não parece lançamento do banco', () => {
    expect(linha.balanceApplied).toBe(false)
    expect(linha.externalId).toBeNull()
    expect(linha.recurringTemplateId).toBeNull()
    expect(linha.isInstallmentForecast).toBe(true)
  })

  it('carrega a chave de casamento e o número da parcela na descrição', () => {
    expect(linha.installmentNumber).toBe(3)
    expect(linha.installmentTotal).toBe(6)
    expect((linha.purchaseDate as Date).toISOString().slice(0, 10)).toBe('2026-07-27')
    expect(linha.description).toBe('AIRBNB * HMR5PP9B9 03/06')
    expect(linha.type).toBe('expense')
  })
})
