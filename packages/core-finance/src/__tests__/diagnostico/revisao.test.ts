import { describe, expect, it } from 'vitest'
import { regraR02, regraR04 } from '../../diagnostico/caixa-e-rendimento'
import { regraR05, regraR06 } from '../../diagnostico/concentracao'
import { regraR12 } from '../../diagnostico/vencimento-e-dados'
import { caixa, contexto, posicao } from './fabrica'

const norm = (s: string) => s.replace(/\s/g, ' ')

describe('achados da revisão final', () => {
  it('R12 aponta posição sem cotação (valor 0)', () => {
    const p = posicao({ classe: 'br_equity', ticker: 'XPTO3', valorCents: 0, nome: 'XPTO3' })
    const r = regraR12(contexto({ posicoes: [p] }))
    expect(r?.metricas.posicoes).toBe(1)
    expect(r?.dica).toContain('sem cotação')
  })

  it('R05 junta a mesma ação em duas linhas pelo ticker', () => {
    const a = posicao({ classe: 'br_equity', ticker: 'PETR4', valorCents: 120_000 })
    const b = posicao({ classe: 'br_equity', ticker: 'petr4', valorCents: 120_000 })
    const [r] = regraR05(contexto({ posicoes: [a, b], caixa: [caixa(760_000)] }))
    expect(r?.metricas.peso).toBeCloseTo(0.24)
  })

  it('R02 junta lotes do mesmo papel e mede a severidade na soma', () => {
    const lote = { nome: 'CDB X', cnpjEmissor: '12345678000199', percentualIndexador: 0.8, valorCents: 6_000_000 }
    const achados = regraR02(contexto({ posicoes: [posicao(lote), posicao(lote)] }), new Set())
    expect(achados).toHaveLength(1)
    expect(achados[0].posicoes).toHaveLength(2)
    expect(achados[0].severidade).toBe('alta')
  })

  it('R12 só com falta de gasto não fala de posições', () => {
    const r = regraR12(contexto({ gastoMensalCents: null }))
    expect(r?.dica).not.toContain('Essas posições')
  })

  it('a dica da R04 cita os títulos que vencem até amanhã', () => {
    expect(regraR04(contexto({ caixa: [caixa(1)] }))?.dica).toContain('vencem até amanhã')
  })

  it('R05 mostra uma casa quando o peso arredondado bate no limite', () => {
    const p = posicao({ classe: 'br_equity', ticker: 'PETR4', valorCents: 204_000 })
    const [r] = regraR05(contexto({ posicoes: [p], caixa: [caixa(796_000)] }))
    expect(norm(r.titulo)).toContain('20,4%')
  })

  it('R06 sem titular não escreve "(titular: sem titular)"', () => {
    const p = posicao({ cnpjEmissor: '60701190000104', valorCents: 30_000_000, titular: null })
    const [r] = regraR06(contexto({ posicoes: [p] }))
    expect(r.titulo).not.toContain('sem titular')
  })
})
