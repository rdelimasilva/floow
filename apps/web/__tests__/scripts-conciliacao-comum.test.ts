import { describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mts fora do app; o vitest resolve em runtime
import { brl, databaseUrl, Rollback, sigla } from '../../../scripts/conciliacao-comum.mts'

describe('conciliacao-comum (scripts)', () => {
  it('sigla anonimiza o nome da conta', () => {
    expect(sigla('Nubank Conta')).toBe('N.C.')
    expect(sigla('itaú')).toBe('I.')
  })

  it('brl formata centavos em reais', () => {
    expect(brl(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
    expect(brl(0).replace(/\s/g, ' ')).toBe('R$ 0,00')
  })

  it('Rollback é um Error distinguível', () => {
    const e = new Rollback()
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(Rollback)
    expect(new Error('x')).not.toBeInstanceOf(Rollback)
  })

  it('databaseUrl prefere o ambiente', () => {
    const antes = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgres://teste'
    try {
      expect(databaseUrl()).toBe('postgres://teste')
    } finally {
      if (antes === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = antes
    }
  })
})
