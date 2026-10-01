import { describe, it, expect } from 'vitest'
import { escolherCandidatas, type PrevisaoAberta } from '@/lib/finance/conciliacao/candidatos'

const LANC = { id: 'r1', accountId: 'itau', date: '2026-09-12', amountCents: -150000, description: 'PIX ALUGUEL CASA' }
const prev = (p: Partial<PrevisaoAberta>): PrevisaoAberta => ({
  id: 'p', accountId: 'itau', contaNome: 'Itaú CC', date: '2026-09-10', amountCents: -150000,
  description: 'Aluguel', categoriaNome: 'Aluguel', ...p,
})

describe('escolherCandidatas', () => {
  it('caso real: SP TJ × Jussara, nomes sem relação e 14% de diferença, não entra', () => {
    const lanc = { id: 'r', accountId: 'itau', date: '2026-07-08', amountCents: -308825, description: 'SP TJ' }
    const r = escolherCandidatas(lanc, [prev({ id: 'j', date: '2026-07-07', amountCents: -360000, description: 'Jussara - Diarista (7/61)' })])
    expect(r).toEqual([])
  })
  it('nome em comum entra mesmo com 15% de diferença', () => {
    const r = escolherCandidatas(LANC, [prev({ id: 'n', amountCents: -172500, description: 'Aluguel apto' })])
    expect(r.map((c) => c.id)).toEqual(['n'])
    expect(r[0].nomeParecido).toBe(true)
  })
  it('valor igual com nome diferente entra; até 2% também', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'igual', description: 'Condomínio' }),
      prev({ id: 'dois', amountCents: -153000, description: 'Escola' }),
    ])
    expect(r.map((c) => c.id)).toEqual(['igual', 'dois'])
    expect(r[0].nomeParecido).toBe(false)
  })
  it('3% de diferença com nome diferente não entra', () => {
    expect(escolherCandidatas(LANC, [prev({ description: 'Escola', amountCents: -154500 })])).toEqual([])
  })
  it('ordena nome parecido primeiro, depois diferença de valor, depois dias; até 3', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'valor', description: 'Escola' }),
      prev({ id: 'nome-longe', description: 'Aluguel', amountCents: -170000 }),
      prev({ id: 'nome-perto-tarde', description: 'Aluguel', amountCents: -151000, date: '2026-09-20' }),
      prev({ id: 'nome-perto-cedo', description: 'Aluguel', amountCents: -151000, date: '2026-09-11' }),
    ])
    expect(r.map((c) => c.id)).toEqual(['nome-perto-cedo', 'nome-perto-tarde', 'nome-longe'])
    expect(r[0]).toMatchObject({ diasDeDiferenca: 1, diferencaCents: 1000, outraConta: false, propostaId: null, nomeParecido: true })
  })
  it('fora da janela de 10 dias ou de outro sinal não entra', () => {
    const r = escolherCandidatas(LANC, [
      prev({ id: 'longe', date: '2026-08-31' }),
      prev({ id: 'sinal', amountCents: 150000 }),
      prev({ id: 'limite', date: '2026-09-22' }),
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
    const r = escolherCandidatas(LANC, [prev({ id: 'igual' }), prev({ id: 'prop', amountCents: -149000, description: 'Outro' })], {
      proposta: { id: 'fmp-1', previsaoId: 'prop' },
    })
    expect(r.map((c) => c.id)).toEqual(['prop', 'igual'])
    expect(r[0].propostaId).toBe('fmp-1')
  })
  it('proposta pendente que não passa no filtro não entra', () => {
    const r = escolherCandidatas(LANC, [prev({ id: 'prop', amountCents: -140000, description: 'Outro' })], {
      proposta: { id: 'fmp-1', previsaoId: 'prop' },
    })
    expect(r).toEqual([])
  })
})
