import { describe, it, expect, vi } from 'vitest'
import { buscarCotacao, buscarHistorico, normalizarTicker, BrapiNaoAutorizada } from '@/lib/mercado/brapi'

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

const cotacao = (symbol: string, preco: number | null, hora = '2026-11-06T17:04:30.000Z') => ({
  results: [{ requestedSymbol: symbol, symbol, data: { regularMarketPrice: preco, regularMarketTime: hora } }],
})

function deps(...respostas: Response[]) {
  const fetch = vi.fn(async () => respostas.shift()!)
  const esperar = vi.fn(async () => {})
  return { fetch: fetch as unknown as typeof globalThis.fetch, token: 't', esperar, chamadas: fetch }
}

describe('brapi', () => {
  it('lê a cotação da PETR4 e manda o token no header', async () => {
    const d = deps(json(cotacao('PETR4', 45.56)))
    const r = await buscarCotacao('PETR4', d)
    expect(r).toEqual({ tipo: 'ok', linhas: [{ ticker: 'PETR4', data: '2026-11-06', fechamento: 45.56 }] })
    const [url, init] = d.chamadas.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://brapi.dev/api/v2/stocks/quote?symbols=PETR4')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer t')
  })

  it('grava IFIX mesmo quando a brapi responde IFIX.SA', async () => {
    const r = await buscarCotacao('IFIX', deps(json(cotacao('IFIX.SA', 3638.8))))
    expect(r).toMatchObject({ tipo: 'ok', linhas: [{ ticker: 'IFIX' }] })
  })

  it('ticker renomeado pela brapi é gravado com o nome que pedimos', async () => {
    const r = await buscarCotacao('BRML3', deps(json(cotacao('ALOS3', 22.1))))
    expect(r).toMatchObject({ tipo: 'ok', linhas: [{ ticker: 'BRML3', fechamento: 22.1 }] })
  })

  it('data do pregão no horário de Brasília', async () => {
    const r = await buscarCotacao('PETR4', deps(json(cotacao('PETR4', 45, '2026-11-07T01:30:00.000Z'))))
    expect(r).toMatchObject({ linhas: [{ data: '2026-11-06' }] })
  })

  it('preço null é sem dado, não zero', async () => {
    expect(await buscarCotacao('XPTO3', deps(json(cotacao('XPTO3', null))))).toEqual({ tipo: 'sem_dado' })
  })

  it('404 é sem dado', async () => {
    expect(await buscarCotacao('XPTO3', deps(json({ error: true }, 404)))).toEqual({ tipo: 'sem_dado' })
  })

  it('401 lança BrapiNaoAutorizada', async () => {
    await expect(buscarCotacao('PETR4', deps(json({ error: true }, 401)))).rejects.toBeInstanceOf(BrapiNaoAutorizada)
  })

  it('429 espera o Retry-After uma vez e tenta de novo', async () => {
    const d = deps(json({}, 429, { 'retry-after': '2' }), json(cotacao('PETR4', 45.56)))
    expect(await buscarCotacao('PETR4', d)).toMatchObject({ tipo: 'ok' })
    expect(d.esperar).toHaveBeenCalledTimes(1)
    expect(d.esperar).toHaveBeenCalledWith(2000)
  })

  it('dois 429 seguidos é limite', async () => {
    const d = deps(json({}, 429, { 'retry-after': '1' }), json({}, 429, { 'retry-after': '1' }))
    expect(await buscarCotacao('PETR4', d)).toEqual({ tipo: 'limite' })
  })

  it('histórico de 3 meses vira uma linha por pregão', async () => {
    const corpo = { results: [{ symbol: 'KNRI11', data: { historicalDataPrice: [
      { date: 1793934000, close: 160.1 }, { date: 1793847600, close: null },
    ] } }] }
    const d = deps(json(corpo))
    const r = await buscarHistorico('KNRI11', d)
    expect(r).toEqual({ tipo: 'ok', linhas: [{ ticker: 'KNRI11', data: new Date(1793934000 * 1000 - 3 * 3600_000).toISOString().slice(0, 10), fechamento: 160.1 }] })
    expect((d.chamadas.mock.calls[0] as unknown as [string])[0]).toBe('https://brapi.dev/api/v2/stocks/historical?symbols=KNRI11&range=3mo&interval=1d')
  })

  it('normalizarTicker', () => {
    expect(normalizarTicker(' ifix.sa ')).toBe('IFIX')
    expect(normalizarTicker('^bvsp')).toBe('^BVSP')
  })
})
