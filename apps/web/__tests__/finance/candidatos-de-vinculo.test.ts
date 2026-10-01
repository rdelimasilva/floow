import { describe, it, expect } from 'vitest'
import { escolherCandidatas, type PrevisaoAberta } from '@/lib/finance/conciliacao/candidatos'

const LANC = { id: 'r1', accountId: 'itau', date: '2026-09-12', amountCents: -150000 }
const prev = (p: Partial<PrevisaoAberta>): PrevisaoAberta => ({
  id: 'p', accountId: 'itau', contaNome: 'Itaú CC', date: '2026-09-10', amountCents: -150000,
  description: 'Aluguel', categoriaNome: 'Aluguel', ...p,
})

describe('escolherCandidatas', () => {
  it('ordena por diferença de valor e depois de dias, até 3', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'a', amountCents: -148000 }),
      prev({ id: 'b', date: '2026-09-15' }),
      prev({ id: 'c' }),
      prev({ id: 'd', amountCents: -140000 }),
    ])
    expect(r.map((c) => c.id)).toEqual(['c', 'b', 'a'])
    expect(r[0]).toMatchObject({ diasDeDiferenca: 2, diferencaCents: 0, outraConta: false, propostaId: null })
  })
  it('fora da janela de 10 dias, de outro sinal ou acima de 20% não entra', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'longe', date: '2026-08-31' }),
      prev({ id: 'sinal', amountCents: 150000 }),
      prev({ id: 'caro', amountCents: -181000 }),
      prev({ id: 'limite', amountCents: -180000, date: '2026-09-22' }),
    ])
    expect(r.map((c) => c.id)).toEqual(['limite'])
  })
  it('só a mesma conta', () => {
    expect(escolherCandidatas(LANC, [prev({ accountId: 'nubank' })])).toEqual([])
  })
  it('par recusado não volta', () => {
    expect(escolherCandidatas(LANC, [prev({ id: 'x' })], { recusadas: new Set(['x']) })).toEqual([])
  })
  it('proposta pendente vira a candidata 1 mesmo pior pontuada', () => {
    const r = escolherCandidatas(LANC, [prev({ id: 'igual' }), prev({ id: 'prop', amountCents: -145000 })], {
      proposta: { id: 'fmp-1', previsaoId: 'prop' },
    })
    expect(r.map((c) => c.id)).toEqual(['prop', 'igual'])
    expect(r[0].propostaId).toBe('fmp-1')
  })
})
