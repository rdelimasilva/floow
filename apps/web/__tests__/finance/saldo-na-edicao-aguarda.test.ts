import { describe, it, expect } from 'vitest'
import { deveAplicarSaldoNaEdicao } from '@/lib/finance/saldo-na-edicao'

/**
 * Linha que aguarda o extrato está fora do saldo por regra (spec de 28/09 §2):
 * salvar a edição não pode somá-la, mesmo sendo lançamento manual com data
 * passada — o caso em que a função devolvia `true` sem olhar mais nada.
 */
const MANUAL = { recurringTemplateId: null, isInstallmentForecast: false, externalId: null, balanceApplied: false }

describe('deveAplicarSaldoNaEdicao com aguarda_extrato', () => {
  it('aguardando: nunca entra no saldo', () => {
    expect(deveAplicarSaldoNaEdicao({ ...MANUAL, aguardaExtrato: true }, '2026-09-01', '2026-09-28')).toBe(false)
  })

  it('sem a marca: manual com data passada entra, como antes', () => {
    expect(deveAplicarSaldoNaEdicao({ ...MANUAL, aguardaExtrato: false }, '2026-09-01', '2026-09-28')).toBe(true)
  })
})
