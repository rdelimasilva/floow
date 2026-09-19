import { describe, it, expect } from 'vitest'
import { contaNoSaldoProjetado } from '@/lib/finance/projected-balance'

/**
 * O saldo projetado da listagem é a única coisa que enxerga previsão.
 *
 * `accounts.balance_cents` é só o que aconteceu de verdade. A previsão futura
 * vive aqui, na conta corrida que a tela calcula — é o que serve para
 * planejar: "com o salário do dia 15, fecho o mês em X".
 *
 * Quando o dia chega, ela sai da projeção. Dali em diante quem diz o que
 * aconteceu é o banco, e enquanto ele não traz o par a linha fica marcada
 * como não conciliada. Somar a previsão vencida seria repetir o defeito
 * antigo, só que na tela.
 */

const HOJE = new Date('2026-09-19T12:00:00-03:00')

const previsao = (extra: Record<string, unknown> = {}) => ({
  balanceApplied: false,
  date: '2026-10-15',
  matchedTransactionId: null,
  ...extra,
})

describe('o que entra no saldo projetado', () => {
  it('lançamento real sempre conta', () => {
    expect(contaNoSaldoProjetado({ balanceApplied: true, date: '2026-09-01' }, HOJE)).toBe(true)
  })

  it('previsão de data futura conta — é a projeção', () => {
    expect(contaNoSaldoProjetado(previsao({ date: '2026-10-15' }), HOJE)).toBe(true)
  })

  it('previsão vencida não conta — espera o lançamento do banco', () => {
    expect(contaNoSaldoProjetado(previsao({ date: '2026-08-15' }), HOJE)).toBe(false)
  })

  it('previsão de hoje não conta — o dia já chegou', () => {
    expect(contaNoSaldoProjetado(previsao({ date: '2026-09-19' }), HOJE)).toBe(false)
  })

  it('previsão já conciliada não conta, mesmo futura — quem soma é o realizado', () => {
    expect(
      contaNoSaldoProjetado(previsao({ date: '2026-10-15', matchedTransactionId: 'real-1' }), HOJE),
    ).toBe(false)
  })
})
