import { describe, it, expect } from 'vitest'
import { PRODUCTS } from '@/app/(app)/accounts/connect/connect-wizard'

describe('produtos oferecidos no wizard', () => {
  it('oferece investimentos, sem marcar por padrão', () => {
    const inv = PRODUCTS.find((p) => p.value === 'INVESTMENTS')
    expect(inv?.label).toBe('Investimentos')
    expect(inv?.hint).toMatch(/renda fixa|fundos/i)
  })
  it('não oferece o que o floow não importa', () => {
    expect(PRODUCTS.map((p) => p.value)).not.toContain('CREDIT_OPERATIONS')
    expect(PRODUCTS.map((p) => p.value)).not.toContain('EXCHANGE')
  })
})
