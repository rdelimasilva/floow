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
  describe('previsão de recorrência antiga sem vínculo (busca ampliada)', () => {
    const PIX = { id: 'pix', accountId: 'itau', date: '2026-01-01', amountCents: -330700, description: 'Pix enviado JUSSARA LEONCIO DE ANDRADE' }
    const JUSSARA = prev({ id: 'j1', date: '2026-01-15', amountCents: -360000, description: 'Jussara - Diarista (1/61)', antiga: true })

    it('caso real: Jussara 15/01 R$ 3.600 × Pix 01/01 R$ 3.307 — 14 dias e 8% entram', () => {
      const r = escolherCandidatas(PIX, [JUSSARA])
      expect(r.map((c) => c.id)).toEqual(['j1'])
      // A candidata vai para a tela: nada dos campos internos da busca.
      expect(r[0]).not.toHaveProperty('antiga')
      expect(r[0]).not.toHaveProperty('contrapartes')
    })
    it('a mesma previsão, se não fosse antiga, ficaria fora (janela de 10 dias)', () => {
      expect(escolherCandidatas(PIX, [{ ...JUSSARA, antiga: false }])).toEqual([])
    })
    it('mesmo mês vale além de 20 dias', () => {
      const r = escolherCandidatas({ ...PIX, date: '2026-01-02' }, [{ ...JUSSARA, date: '2026-01-30' }])
      expect(r.map((c) => c.id)).toEqual(['j1'])
    })
    it('mais de 20 dias em outro mês não entra', () => {
      expect(escolherCandidatas({ ...PIX, date: '2025-12-20' }, [{ ...JUSSARA, date: '2026-01-15' }])).toEqual([])
    })
    it('nome parecido com mais de 20% de diferença não entra', () => {
      expect(escolherCandidatas({ ...PIX, amountCents: -200000 }, [JUSSARA])).toEqual([])
    })
    it('nome diferente só com valor quase igual', () => {
      const outro = { ...PIX, description: 'Pix enviado MARIA' }
      expect(escolherCandidatas(outro, [JUSSARA])).toEqual([])
      expect(escolherCandidatas({ ...outro, amountCents: -358000 }, [JUSSARA]).map((c) => c.id)).toEqual(['j1'])
    })
    it('mesma contraparte de vínculos anteriores da série conta como nome e vem primeiro', () => {
      const lanc = { ...PIX, description: 'TED 0001 ANDRADE', counterpartyId: 'cp-jussara' }
      const r = escolherCandidatas(lanc, [
        prev({ id: 'parecida', date: '2026-01-10', amountCents: -330700, description: 'Escola', antiga: true }),
        { ...JUSSARA, contrapartes: ['cp-jussara'] },
      ])
      expect(r.map((c) => c.id)).toEqual(['j1', 'parecida'])
    })
  })

  it('proposta pendente que não passa no filtro não entra', () => {
    const r = escolherCandidatas(LANC, [prev({ id: 'prop', amountCents: -140000, description: 'Outro' })], {
      proposta: { id: 'fmp-1', previsaoId: 'prop' },
    })
    expect(r).toEqual([])
  })
})
