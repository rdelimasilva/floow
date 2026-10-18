import { describe, it, expect } from 'vitest'
import { camposQueAcompanhamOModelo, descricaoDaParcela } from '@/lib/finance/recurring-propagate'

/**
 * Editar a recorrência muda a série daqui para frente.
 *
 * Em produção (18/10/2026) "TIM internet" ganhou categoria e "Flavio -
 * Terapia" passou de Saúde/R$ 2.300 para Psicólogo/R$ 3.800, mas as parcelas
 * já geradas seguiram vazias e em Saúde/R$ 2.300: só a data acompanhava a
 * edição. Agora categoria, valor, tipo, conta e descrição também acompanham,
 * nas mesmas parcelas que a data move (previsão pura, de hoje em diante).
 */
const atual = { type: 'expense' as const, amountCents: 230000 }

describe('o que a edição da recorrência leva às parcelas pendentes', () => {
  it('categoria, conta e valor com o sinal do tipo', () => {
    expect(camposQueAcompanhamOModelo({ categoryId: 'psi', accountId: 'itau', type: 'expense', amountCents: 380000 }, atual)).toEqual({
      categoryId: 'psi', accountId: 'itau', type: 'expense', amountCents: -380000,
    })
  })

  it('receita fica positiva', () => {
    expect(camposQueAcompanhamOModelo({ type: 'income', amountCents: 500 }, atual)).toEqual({ type: 'income', amountCents: 500 })
  })

  it('categoria apagada no modelo apaga nas parcelas', () => {
    expect(camposQueAcompanhamOModelo({ categoryId: null }, atual)).toEqual({ categoryId: null })
  })

  it('valor sem tipo usa o tipo atual do modelo', () => {
    expect(camposQueAcompanhamOModelo({ amountCents: 15900 }, atual)).toEqual({ type: 'expense', amountCents: -15900 })
  })

  it('tipo sem valor vira o sinal do valor atual', () => {
    expect(camposQueAcompanhamOModelo({ type: 'income' }, atual)).toEqual({ type: 'income', amountCents: 230000 })
  })

  it('nada editado, nada a levar', () => {
    expect(camposQueAcompanhamOModelo({}, atual)).toEqual({})
  })
})

describe('descrição da parcela', () => {
  it('mantém o (n/N) da série', () => {
    expect(descricaoDaParcela('Flavio - Psicólogo', 11, 61)).toBe('Flavio - Psicólogo (11/61)')
  })

  it('lançamento avulso da série (sem total) fica só com o nome', () => {
    expect(descricaoDaParcela('TIM internet', null, null)).toBe('TIM internet')
    expect(descricaoDaParcela('TIM internet', 1, 1)).toBe('TIM internet')
  })
})
