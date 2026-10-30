import { describe, it, expect } from 'vitest'
import { aplicadoEmInvestimentos } from '@/lib/finance/aplicado-em-investimentos'

describe('aplicadoEmInvestimentos', () => {
  const corretora = new Set(['inv'])

  it('soma só a entrada por transferência na conta de investimento', () => {
    const total = aplicadoEmInvestimentos(
      [
        { type: 'transfer', amountCents: 1000_00, accountId: 'inv' },
        { type: 'transfer', amountCents: -1000_00, accountId: 'cc' },
        { type: 'transfer', amountCents: -300_00, accountId: 'inv' },
        { type: 'income', amountCents: 50_00, accountId: 'inv' },
        { type: 'transfer', amountCents: 200_00, accountId: 'cc' },
      ],
      corretora,
    )
    expect(total).toBe(1000_00)
  })

  it('sem conta de investimento, dá zero', () => {
    expect(aplicadoEmInvestimentos([{ type: 'transfer', amountCents: 10_00, accountId: 'cc' }], new Set())).toBe(0)
  })
})
