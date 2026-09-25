import { describe, it, expect } from 'vitest'
import { agruparPorBloco } from '@/lib/finance/account-types'

describe('agruparPorBloco', () => {
  it('separa correntes, investimentos e cartões, nessa ordem, sem bloco vazio', () => {
    const r = agruparPorBloco([
      { id: 'c', type: 'credit_card' as const },
      { id: 'a', type: 'checking' as const },
      { id: 'p', type: 'savings' as const },
      { id: 'd', type: 'cash' as const },
    ])
    expect(r.map((b) => [b.key, b.contas.map((c) => c.id)])).toEqual([
      ['correntes', ['a', 'p', 'd']],
      ['cartoes', ['c']],
    ])
  })

  it('investimento vai para o próprio bloco', () => {
    const r = agruparPorBloco([{ id: 'i', type: 'brokerage' as const }])
    expect(r.map((b) => b.key)).toEqual(['investimentos'])
  })
})
