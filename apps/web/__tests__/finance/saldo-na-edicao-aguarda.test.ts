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

/**
 * Previsão de recorrência nunca entra no saldo, nem com a data já passada:
 * quem soma é o realizado que a cumpre. Editar a "Energia (2/61)" vencida a
 * punha no saldo, e aí ela sumia da conciliação (que só olha previsão fora do
 * saldo) e a conta de luz contava duas vezes.
 */
describe('deveAplicarSaldoNaEdicao com previsão de recorrência', () => {
  it('data passada: continua fora do saldo', () => {
    expect(deveAplicarSaldoNaEdicao({ ...MANUAL, recurringTemplateId: 'rt-1' }, '2026-11-17', '2026-11-23')).toBe(false)
  })
})
