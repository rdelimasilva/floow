import { describe, it, expect, vi } from 'vitest'
import { rodarTesouro } from '@/lib/mercado/jobs/tesouro'
import { rodarB3 } from '@/lib/mercado/jobs/b3'
import { repoMemoria } from './repo-memoria'

const CAB = 'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha'

describe('rodarTesouro', () => {
  it('grava só os dias depois do último gravado', async () => {
    const { repo, tabelas } = repoMemoria()
    await repo.gravarTesouro([{ tipo: 'Tesouro Selic', vencimento: '2029-03-01', data: '2026-11-04', taxaCompra: 0.06, taxaVenda: 0.07, puCompra: 1, puVenda: 1 }])
    const csv = [CAB, 'Tesouro Selic;01/03/2029;04/11/2026;0,06;0,07;1;1;1', 'Tesouro Selic;01/03/2029;05/11/2026;0,06;0,07;2;2;2'].join('\n')
    const fetch = vi.fn(async () => new Response(csv, { status: 200 }))
    const r = await rodarTesouro({ fetch: fetch as never, repo })
    expect(r).toEqual({ linhas: 1, invalidas: 0, total: 1 })
    expect(tabelas.tesouro.size).toBe(2)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('PrecoTaxaTesouroDireto.csv')
  })

  it('erro HTTP derruba o job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('x', { status: 500 }))
    await expect(rodarTesouro({ fetch: fetch as never, repo })).rejects.toThrow(/500/)
  })
})

const cotacao = (symbol: string) =>
  new Response(JSON.stringify({ results: [{ symbol, data: { regularMarketPrice: 10, regularMarketTime: '2026-11-06T20:00:00.000Z' } }] }), { status: 200 })

describe('rodarB3', () => {
  it('para no prazo e deixa o resto para o dia seguinte', async () => {
    const { repo } = repoMemoria()
    let relogio = 0
    const fetch = vi.fn(async (url: string) => {
      relogio += 30_000
      return cotacao(new URL(url).searchParams.get('symbols')!)
    })
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B', 'C'], agora: () => relogio, prazoMs: 50_000 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(r.linhas).toBe(2)
  })

  it('começa pelo ticker com fechamento mais antigo', async () => {
    const { repo } = repoMemoria()
    await repo.gravarFechamentos([{ ticker: 'A', data: '2026-11-05', fechamento: 1 }, { ticker: 'B', data: '2026-11-01', fechamento: 1 }])
    const fetch = vi.fn(async (url: string) => cotacao(new URL(url).searchParams.get('symbols')!))
    await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B'], agora: () => 0 })
    expect(fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('symbols'))).toEqual(['B', 'A'])
  })

  it('limite da brapi encerra o laço sem falhar', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '1' } }))
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B'], agora: () => 0, esperar: async () => {} })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ linhas: 0, invalidas: 0, total: 0 })
  })

  it('ticker sem pregão não conta como formato quebrado', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('{}', { status: 404 }))
    expect(await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['XPTO3'], agora: () => 0 })).toEqual({ linhas: 0, invalidas: 0, total: 0 })
  })

  it('401 derruba o job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('{}', { status: 401 }))
    await expect(rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A'], agora: () => 0 })).rejects.toThrow(/401/)
  })

  it('sem token nem chama a brapi', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn()
    await expect(rodarB3({ fetch: fetch as never, repo, token: undefined, tickers: ['A'], agora: () => 0 })).rejects.toThrow(/BRAPI_TOKEN ausente/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
