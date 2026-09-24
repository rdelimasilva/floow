import { describe, it, expect } from 'vitest'
import { ehCpfProprio } from '@/lib/openfinance/cpf-proprio'
import { hashCpf } from '@/lib/openfinance/cpf'

const SALT = 'salt-de-teste'
const CPF = '330.764.928-02'
const hashes = new Set([hashCpf(CPF, SALT)])

describe('ehCpfProprio', () => {
  it('reconhece o CPF do titular, com ou sem máscara', () => {
    expect(ehCpfProprio(CPF, hashes, SALT)).toBe(true)
    expect(ehCpfProprio('33076492802', hashes, SALT)).toBe(true)
  })
  it('outro CPF não é próprio', () => {
    expect(ehCpfProprio('52998224725', hashes, SALT)).toBe(false)
  })
  it('CNPJ, vazio, sem conexão ou sem salt: false, sem lançar', () => {
    expect(ehCpfProprio('12.345.678/0001-95', hashes, SALT)).toBe(false)
    expect(ehCpfProprio(null, hashes, SALT)).toBe(false)
    expect(ehCpfProprio(CPF, new Set(), SALT)).toBe(false)
    expect(ehCpfProprio(CPF, hashes, '')).toBe(false)
  })
})
