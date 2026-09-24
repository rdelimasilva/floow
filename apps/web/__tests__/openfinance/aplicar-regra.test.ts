import { describe, it, expect } from 'vitest'
import { contaQueARegraGrava } from '@/lib/openfinance/aplicar-regra'

describe('contaQueARegraGrava', () => {
  it('transferência comum grava a conta escolhida', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: false })).toBe('c1')
  })
  it('CPF próprio nunca grava conta, mesmo se veio uma', () => {
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: 'c1', cpfProprio: true })).toBeNull()
    expect(contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: true })).toBeNull()
  })
  it('transferência sem conta e sem CPF próprio é recusada', () => {
    expect(() => contaQueARegraGrava({ nature: 'transfer', transferAccountId: null, cpfProprio: false }))
      .toThrow('Transferência exige a outra conta')
  })
  it('receita/despesa nunca grava conta', () => {
    expect(contaQueARegraGrava({ nature: 'expense', transferAccountId: null, cpfProprio: false })).toBeNull()
  })
})
