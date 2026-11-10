import { describe, expect, it } from 'vitest'
import { regraR11, regraR12 } from '../../diagnostico/vencimento-e-dados'
import { contexto, posicao } from './fabrica'

describe('R11: vencimento próximo', () => {
  it('dispara com 29 dias e com 0 dia', () => {
    const p29 = posicao({ vencimento: '2026-12-09', valorCents: 2_200_000 })
    const p0 = posicao({ vencimento: '2026-11-10' })
    const achados = regraR11(contexto({ posicoes: [p29, p0] }))
    expect(achados.map((a) => a.posicoes[0])).toEqual([p29.assetId, p0.assetId])
    expect(achados[0].exposicaoCents).toBe(2_200_000)
    expect(achados[0].severidade).toBe('info')
  })

  it('não dispara com 30 dias nem com vencimento passado', () => {
    const p30 = posicao({ vencimento: '2026-12-10' })
    const vencida = posicao({ vencimento: '2026-11-09' })
    expect(regraR11(contexto({ posicoes: [p30, vencida] }))).toEqual([])
  })
})

describe('R12: dados incompletos', () => {
  it('junta duas posições sem taxa num achado só', () => {
    const a = posicao({ indexador: null, percentualIndexador: null, nome: 'CDB A' })
    const b = posicao({ indexador: null, percentualIndexador: null, nome: 'CDB B' })
    const r = regraR12(contexto({ posicoes: [a, b] }))
    expect(r?.metricas.posicoes).toBe(2)
    expect(r?.posicoes).toEqual([a.assetId, b.assetId])
    expect(r?.dica).toContain('CDB A')
  })

  it('ação sem ticker entra', () => {
    const p = posicao({ classe: 'br_equity', ticker: null, indexador: null, percentualIndexador: null })
    expect(regraR12(contexto({ posicoes: [p] }))?.metricas.posicoes).toBe(1)
  })

  it('gasto sem histórico gera achado com 0 posição', () => {
    const r = regraR12(contexto({ gastoMensalCents: null }))
    expect(r?.metricas.posicoes).toBe(0)
    expect(r?.dica).toContain('sem histórico de gastos suficiente')
  })

  it('carteira completa não gera R12', () => {
    const rf = posicao()
    const pre = posicao({ indexador: null, percentualIndexador: null, taxaPrefixada: 0.13 })
    const acao = posicao({ classe: 'br_equity', ticker: 'PETR4', percentualIndexador: null })
    expect(regraR12(contexto({ posicoes: [rf, pre, acao] }))).toBeNull()
  })
})
