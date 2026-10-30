import { describe, expect, it } from 'vitest'
import { nomeDoMes } from '@/lib/finance/nome-do-mes'

describe('nomeDoMes', () => {
  it('sobe só a primeira letra do mês por extenso', () => {
    expect(nomeDoMes('2026-10')).toBe('Outubro de 2026')
  })

  it('deixa o formato curto em minúsculas, como nos eixos', () => {
    expect(nomeDoMes('2026-03', 'short')).toMatch(/^mar/)
  })
})
