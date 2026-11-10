import { describe, it, expect, vi } from 'vitest'
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
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

const semUso = async () => ({ usado: 0, limite: 15_000 })

describe('rodarB3', () => {
  it('para no prazo e deixa o resto para o dia seguinte', async () => {
    const { repo } = repoMemoria()
    let relogio = 0
    const fetch = vi.fn(async (url: string) => {
      relogio += 30_000
      return cotacao(new URL(url).searchParams.get('symbols')!)
    })
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B', 'C'], agora: () => relogio, prazoMs: 50_000, usoDaCota: semUso })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(r.linhas).toBe(2)
  })

  it('dois tickers que a brapi devolve com o mesmo símbolo não quebram o insert', async () => {
    const { repo, tabelas } = repoMemoria()
    const fetch = vi.fn(async () => cotacao('ALOS3'))
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['BRML3', 'ALOS3'], agora: () => 0, usoDaCota: semUso })
    expect(r.linhas).toBe(2)
    expect([...tabelas.fechamentos.keys()].sort()).toEqual(['ALOS3|2026-11-06', 'BRML3|2026-11-06'])
  })

  it('começa pelo ticker com fechamento mais antigo', async () => {
    const { repo } = repoMemoria()
    await repo.gravarFechamentos([{ ticker: 'A', data: '2026-11-05', fechamento: 1 }, { ticker: 'B', data: '2026-11-01', fechamento: 1 }])
    const fetch = vi.fn(async (url: string) => cotacao(new URL(url).searchParams.get('symbols')!))
    await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B'], agora: () => 0, usoDaCota: semUso })
    expect(fetch.mock.calls.map((c) => new URL(c[0]).searchParams.get('symbols'))).toEqual(['B', 'A'])
  })

  it('limite da brapi no meio encerra o laço e grava o que já veio', async () => {
    const { repo, tabelas } = repoMemoria()
    const respostas = [cotacao('A'), new Response('{}', { status: 429, headers: { 'retry-after': '1' } }), new Response('{}', { status: 429, headers: { 'retry-after': '1' } })]
    const fetch = vi.fn(async () => respostas.shift()!)
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B', 'C'], agora: () => 0, esperar: async () => {}, usoDaCota: semUso })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(r).toMatchObject({ linhas: 1, naoEncontrados: 2 })
    expect(tabelas.fechamentos.size).toBe(1)
  })

  it('limite logo na primeira chamada é falha, não sucesso com zero linhas', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '1' } }))
    await expect(rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B'], agora: () => 0, esperar: async () => {}, usoDaCota: semUso })).rejects.toThrow(/limite/)
  })

  it('ticker sem pregão fica contado, não é formato quebrado', async () => {
    const { repo } = repoMemoria()
    const respostas = [cotacao('A'), new Response('{}', { status: 404 })]
    const fetch = vi.fn(async () => respostas.shift()!)
    expect(await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'XPTO3'], agora: () => 0, usoDaCota: semUso })).toEqual({ linhas: 1, invalidas: 0, total: 1, naoEncontrados: 1 })
  })

  it('erro num ticker não perde os outros', async () => {
    const { repo, tabelas } = repoMemoria()
    const respostas = [cotacao('A'), new Response('erro', { status: 502 }), cotacao('C')]
    const fetch = vi.fn(async () => respostas.shift()!)
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B', 'C'], agora: () => 0, usoDaCota: semUso })
    expect(r).toMatchObject({ linhas: 2, naoEncontrados: 1 })
    expect(tabelas.fechamentos.size).toBe(2)
  })

  it('todos os tickers falhando é falha do job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('erro', { status: 502 }))
    await expect(rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A', 'B'], agora: () => 0, usoDaCota: semUso })).rejects.toThrow(/nenhuma cotação/)
  })

  it('avisa quando o uso da cota da brapi passa de 80%', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => cotacao('A'))
    const avisar = vi.fn()
    const uso = vi.fn(async () => ({ usado: 12_100, limite: 15_000 }))
    await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A'], agora: () => 0, usoDaCota: uso, avisar })
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/81%/))
  })

  it('abaixo de 80% não avisa, e erro ao ler o uso não derruba o job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => cotacao('A'))
    const avisar = vi.fn()
    await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A'], agora: () => 0, usoDaCota: async () => ({ usado: 100, limite: 15_000 }), avisar })
    const r = await rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A'], agora: () => 0, usoDaCota: async () => { throw new Error('x') }, avisar })
    expect(avisar).not.toHaveBeenCalled()
    expect(r.linhas).toBe(1)
  })

  it('401 derruba o job', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn(async () => new Response('{}', { status: 401 }))
    await expect(rodarB3({ fetch: fetch as never, repo, token: 't', tickers: ['A'], agora: () => 0, usoDaCota: semUso })).rejects.toThrow(/401/)
  })

  it('sem token nem chama a brapi', async () => {
    const { repo } = repoMemoria()
    const fetch = vi.fn()
    await expect(rodarB3({ fetch: fetch as never, repo, token: undefined, tickers: ['A'], agora: () => 0, usoDaCota: semUso })).rejects.toThrow(/BRAPI_TOKEN ausente/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
