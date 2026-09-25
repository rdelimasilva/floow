import { describe, expect, it } from 'vitest'
import { podeDesconciliar } from '@/lib/finance/desconciliar'

const base = {
  counterpartyId: null,
  reviewState: 'confirmed',
  transferGroupId: null,
  externalId: 'polp-1',
  matchedTransactionId: null,
  cumprePrevisao: false,
}

describe('podeDesconciliar', () => {
  it('lançamento manual, sem regra nem previsão: nada a desconciliar', () => {
    expect(podeDesconciliar({ ...base, externalId: null })).toBeNull()
  })

  it('classificado pela regra da contraparte volta para Classificar', () => {
    expect(podeDesconciliar({ ...base, counterpartyId: 'cp' })).toBe('classificar')
  })

  it('ainda pendente já está na fila', () => {
    expect(podeDesconciliar({ ...base, counterpartyId: 'cp', reviewState: 'pending' })).toBeNull()
  })

  it('a perna que a regra criou na outra conta desconcilia o par', () => {
    expect(podeDesconciliar({ ...base, externalId: 'polp-1:transfer-dest', transferGroupId: 'g' })).toBe('classificar')
    expect(podeDesconciliar({ ...base, externalId: 'polp-1:transfer-par', transferGroupId: 'g' })).toBe('classificar')
  })

  it('transferência manual entre contas não é conciliação', () => {
    expect(podeDesconciliar({ ...base, externalId: null, transferGroupId: 'g' })).toBeNull()
  })

  it('previsão cumprida e o realizado que a cumpre voltam para Confirmar previsões', () => {
    expect(podeDesconciliar({ ...base, externalId: null, matchedTransactionId: 'r' })).toBe('previsoes')
    expect(podeDesconciliar({ ...base, cumprePrevisao: true })).toBe('previsoes')
  })

  it('previsão vence a regra: o casamento é o que foi decidido por último', () => {
    expect(podeDesconciliar({ ...base, counterpartyId: 'cp', cumprePrevisao: true })).toBe('previsoes')
  })
})
