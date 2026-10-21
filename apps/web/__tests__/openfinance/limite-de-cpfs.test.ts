import { describe, expect, it } from 'vitest'
import { excedeLimiteDeCpfs } from '@/lib/openfinance/limite-de-cpfs'

describe('excedeLimiteDeCpfs', () => {
  const cinco = ['a', 'b', 'c', 'd', 'e']

  it('org sem conexão aceita o primeiro CPF', () => {
    expect(excedeLimiteDeCpfs([], 'a')).toBe(false)
  })

  it('quinto CPF ainda entra', () => {
    expect(excedeLimiteDeCpfs(['a', 'b', 'c', 'd'], 'e')).toBe(false)
  })

  it('sexto CPF passa do limite', () => {
    expect(excedeLimiteDeCpfs(cinco, 'f')).toBe(true)
  })

  it('CPF já conectado em outro banco não ocupa vaga nova', () => {
    expect(excedeLimiteDeCpfs(cinco, 'c')).toBe(false)
  })

  it('várias conexões do mesmo CPF contam como uma', () => {
    expect(excedeLimiteDeCpfs(['a', 'a', 'a', 'b', 'c', 'd'], 'e')).toBe(false)
  })
})
