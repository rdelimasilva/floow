import { describe, expect, it } from 'vitest'
import { primeiroNome } from '@/lib/finance/titular'

describe('primeiroNome', () => {
  it('fica só com o primeiro nome', () => {
    expect(primeiroNome('  Ana Maria Souza ')).toBe('Ana')
  })

  it('vazio, só espaço ou ausente vira null', () => {
    expect(primeiroNome('')).toBeNull()
    expect(primeiroNome('   ')).toBeNull()
    expect(primeiroNome(undefined)).toBeNull()
  })

  it('corta nome comprido em 30 caracteres', () => {
    expect(primeiroNome('a'.repeat(40))).toHaveLength(30)
  })
})
