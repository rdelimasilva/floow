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

/**
 * A perna de um aporte em conta de corretora fica na lista — ela registra que
 * o dinheiro saiu do Itau e entrou na XP — mas nao soma na coluna de saldo.
 *
 * Somando as duas pernas, o aporte se anula: sai -5.000 do Itau, entra +5.000
 * na corretora, e o saldo corrido nao se mexe. O dinheiro parece nao ter
 * custado nada. A coluna e de conta corrente e cartao; o lado do investimento
 * vive no modulo de investimentos.
 */
describe('conta de investimento na coluna de saldo', () => {
  const real = (extra: Record<string, unknown> = {}) => ({
    balanceApplied: true,
    date: '2026-09-01',
    ...extra,
  })

  it('lançamento em conta corrente conta', () => {
    expect(contaNoSaldoProjetado(real({ accountType: 'checking' }), HOJE)).toBe(true)
  })

  it('lançamento em cartão conta', () => {
    expect(contaNoSaldoProjetado(real({ accountType: 'credit_card' }), HOJE)).toBe(true)
  })

  it('perna de aporte em corretora não conta', () => {
    expect(contaNoSaldoProjetado(real({ accountType: 'brokerage' }), HOJE)).toBe(false)
  })

  it('sem o tipo da conta, conta — não some saldo por dado ausente', () => {
    expect(contaNoSaldoProjetado(real(), HOJE)).toBe(true)
  })
})
