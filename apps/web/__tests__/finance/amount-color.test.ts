import { describe, it, expect } from 'vitest'
import { amountColorClass } from '@/components/finance/transaction-list-types'

/**
 * A cor do valor segue o SINAL, não o tipo.
 *
 * Antes seguia o tipo: `income` verde, `expense` vermelho, `transfer` azul.
 * Como o dado tem 806 despesas (todas negativas) e 66 transferências
 * negativas, a coluna mostrava o mesmo sinal em duas cores — vermelho e azul
 * lado a lado. A cor codificava tipo e o leitor lia sinal.
 *
 * Transferência que sai da conta é dinheiro saindo daquela conta, igual a
 * despesa, e o saldo trata as duas do mesmo jeito. Que seja transferência já
 * está dito na coluna de tipo.
 */
describe('amountColorClass', () => {
  it('negativo é vermelho, seja despesa ou transferência', () => {
    expect(amountColorClass(-50000)).toBe(amountColorClass(-1))
    expect(amountColorClass(-50000)).toContain('red')
  })

  it('positivo é verde', () => {
    expect(amountColorClass(50000)).toContain('green')
  })

  it('zero não é vermelho nem verde — não houve entrada nem saída', () => {
    const zero = amountColorClass(0)
    expect(zero).not.toContain('red')
    expect(zero).not.toContain('green')
  })
})
