import { describe, it, expect } from 'vitest'
import { recursosDeConta } from '@/lib/openfinance/sync'

describe('recursosDeConta', () => {
  it('só conta e cartão entram no sync de lançamentos', () => {
    const rs = ['ACCOUNT', 'CREDIT_CARD_ACCOUNT', 'FUND', 'BANK_FIXED_INCOME', 'VARIABLE_INCOME'].map((resourceType) => ({ resourceType }))
    expect(recursosDeConta(rs).map((r) => r.resourceType)).toEqual(['ACCOUNT', 'CREDIT_CARD_ACCOUNT'])
  })
})
