import { describe, it, expect } from 'vitest'
import { createPortfolioEventSchema, updatePortfolioEventSchema } from '@floow/shared'

/**
 * A quantidade passou a aceitar fração (cotas). Mas o formulário manda
 * qualquer texto não vazio, e eventos antigos foram gravados com quantidade 0
 * (o schema antigo, `.int()`, aceitava). Esses eventos têm de continuar
 * editáveis: 0 vale, negativo não.
 */
const base = {
  assetId: '11111111-1111-4111-8111-111111111111',
  accountId: '22222222-2222-4222-8222-222222222222',
  eventType: 'dividend' as const,
  eventDate: '2026-06-10',
  totalCents: 1000,
}

describe('createPortfolioEventSchema.quantity', () => {
  it('aceita fração', () => {
    expect(createPortfolioEventSchema.safeParse({ ...base, eventType: 'buy', quantity: 1.5 }).success).toBe(true)
  })
  it('aceita 0 (evento legado de dividendo com quantidade 0 continua editável)', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    expect(updatePortfolioEventSchema.safeParse({ ...base, id, quantity: 0 }).success).toBe(true)
  })
  it('recusa negativo', () => {
    expect(createPortfolioEventSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false)
  })
})
