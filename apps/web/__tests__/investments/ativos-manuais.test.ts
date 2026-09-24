import { describe, it, expect } from 'vitest'
import { ativosManuais } from '@/lib/investments/ativos-manuais'

describe('ativosManuais', () => {
  it('evento manual não pode ser lançado em ativo do Open Finance', () => {
    const lista = [
      { id: 'a', source: 'manual' as const },
      { id: 'b', source: 'openfinance' as const },
      { id: 'c', source: 'manual' as const },
    ]
    expect(ativosManuais(lista).map((a) => a.id)).toEqual(['a', 'c'])
  })
})
