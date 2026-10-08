import { describe, it, expect } from 'vitest'
import { createAccountSchema, updateAccountSchema } from '@floow/shared'

/**
 * Todo cartão de crédito tem fechamento e vencimento cadastrados pelo
 * cliente. A fatura e a data das parcelas saem desses dois dias; sem eles o
 * app teria de adivinhar o ciclo — e adivinhar errado põe compra na fatura
 * errada.
 */
const ID = '00000000-0000-4000-8000-000000000000'

describe('ciclo do cartão é obrigatório', () => {
  it('cartão sem fechamento ou vencimento é recusado', () => {
    expect(createAccountSchema.safeParse({ name: 'Visa', type: 'credit_card' }).success).toBe(false)
    expect(createAccountSchema.safeParse({ name: 'Visa', type: 'credit_card', closingDay: 8 }).success).toBe(false)
    expect(updateAccountSchema.safeParse({ id: ID, name: 'Visa', type: 'credit_card', dueDay: 15 }).success).toBe(false)
  })
  it('cartão com os dois dias passa', () => {
    expect(createAccountSchema.safeParse({ name: 'Visa', type: 'credit_card', closingDay: 8, dueDay: 15 }).success).toBe(true)
    expect(updateAccountSchema.safeParse({ id: ID, name: 'Visa', type: 'credit_card', closingDay: 8, dueDay: 15 }).success).toBe(true)
  })
  it('conta que não é cartão não pede os dias', () => {
    expect(createAccountSchema.safeParse({ name: 'Itaú', type: 'checking' }).success).toBe(true)
  })
})
