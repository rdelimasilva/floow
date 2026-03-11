import { describe, it, expect } from 'vitest'
import { centsToCurrency, currencyToCents, formatBRL } from '../balance'

describe('centsToCurrency', () => {
  it('converts 15075 cents to BRL string containing "150,75"', () => {
    const result = centsToCurrency(15075)
    expect(result).toContain('150,75')
  })

  it('converts 0 cents to string containing "0,00"', () => {
    const result = centsToCurrency(0)
    expect(result).toContain('0,00')
  })

  it('converts negative cents to a negative BRL string', () => {
    const result = centsToCurrency(-5000)
    // Should contain 50,00 and some negative indicator
    expect(result).toContain('50,00')
    // The string should be different from positive representation
    expect(result).not.toBe(centsToCurrency(5000))
  })
})

describe('currencyToCents', () => {
  it('converts numeric 150.75 to 15075 cents', () => {
    expect(currencyToCents(150.75)).toBe(15075)
  })

  it('converts string "150,75" to 15075 cents (Brazilian format)', () => {
    expect(currencyToCents('150,75')).toBe(15075)
  })

  it('converts 0 to 0 cents', () => {
    expect(currencyToCents(0)).toBe(0)
  })
})

describe('formatBRL', () => {
  it('formats 15075 cents as "R$ 150,75"', () => {
    const result = formatBRL(15075)
    expect(result).toContain('R$')
    expect(result).toContain('150,75')
  })
})
