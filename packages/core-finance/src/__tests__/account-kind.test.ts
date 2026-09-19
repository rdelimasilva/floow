import { describe, it, expect } from 'vitest'
import { ehContaDeInvestimento } from '../account-kind'

/**
 * Conta de investimento não pertence ao mundo das transações.
 *
 * A definição é por EXCLUSÃO — "investimento" — e não por uma lista fechada
 * de "corrente e cartão". Poupança e dinheiro em espécie são transacionais:
 * uma lista fechada os deixaria de fora no dia em que aparecessem, e o erro
 * seria silencioso (some do seletor, some do saldo).
 */

describe('ehContaDeInvestimento', () => {
  it('corretora é conta de investimento', () => {
    expect(ehContaDeInvestimento('brokerage')).toBe(true)
  })

  it('conta corrente não é', () => {
    expect(ehContaDeInvestimento('checking')).toBe(false)
  })

  it('cartão de crédito não é', () => {
    expect(ehContaDeInvestimento('credit_card')).toBe(false)
  })

  it('poupança não é — é transacional, mesmo rendendo', () => {
    expect(ehContaDeInvestimento('savings')).toBe(false)
  })

  it('dinheiro em espécie não é', () => {
    expect(ehContaDeInvestimento('cash')).toBe(false)
  })
})
