import { z } from 'zod'

/**
 * Cliente da brapi.dev, plano grátis: um ticker por chamada, uma chamada por
 * vez, histórico de no máximo 3 meses. O token vem de BRAPI_TOKEN, nunca do
 * código.
 */

const BASE = 'https://brapi.dev/api/v2'
const TIMEOUT_MS = 10_000

export type Fechamento = { ticker: string; data: string; fechamento: number }

export type ResultadoBrapi = { tipo: 'ok'; linhas: Fechamento[] } | { tipo: 'sem_dado' } | { tipo: 'limite' }

export class BrapiNaoAutorizada extends Error {
  constructor() {
    super('brapi recusou o token (401). Confira BRAPI_TOKEN.')
  }
}

export type DepsBrapi = {
  fetch: typeof fetch
  token: string
  esperar?: (ms: number) => Promise<void>
}

/** Maiúsculas e sem o `.SA` que a brapi devolve em alguns índices (IFIX.SA). */
export function normalizarTicker(s: string): string {
  return s.trim().toUpperCase().replace(/\.SA$/, '')
}

const dataEmBrasilia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const Cotacao = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        data: z.object({ regularMarketPrice: z.number().nullish(), regularMarketTime: z.string().nullish() }).nullish(),
      }),
    )
    .nullish(),
})

const Historico = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        data: z
          .object({ historicalDataPrice: z.array(z.object({ date: z.number(), close: z.number().nullish() })).nullish() })
          .nullish(),
      }),
    )
    .nullish(),
})

const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** GET com o token; 429 espera o Retry-After uma vez. Devolve o JSON ou o motivo de não ter. */
async function pedir(url: string, deps: DepsBrapi): Promise<unknown | 'sem_dado' | 'limite'> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await deps.fetch(url, {
      headers: { Authorization: `Bearer ${deps.token}` },
      // Servidor travado não pode segurar o job até o fim do prazo da função.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (r.status === 401) throw new BrapiNaoAutorizada()
    if (r.status === 404) return 'sem_dado'
    if (r.status === 429) {
      if (tentativa === 1) return 'limite'
      const segundos = Number(r.headers.get('retry-after'))
      await (deps.esperar ?? esperarPadrao)((Number.isFinite(segundos) && segundos > 0 ? segundos : 1) * 1000)
      continue
    }
    if (!r.ok) throw new Error(`brapi respondeu ${r.status} em ${url}`)
    return r.json()
  }
  return 'limite'
}

export async function buscarCotacao(ticker: string, deps: DepsBrapi): Promise<ResultadoBrapi> {
  const corpo = await pedir(`${BASE}/stocks/quote?symbols=${encodeURIComponent(ticker)}`, deps)
  if (corpo === 'sem_dado' || corpo === 'limite') return { tipo: corpo }
  const item = Cotacao.parse(corpo).results?.[0]
  const preco = item?.data?.regularMarketPrice
  const hora = item?.data?.regularMarketTime
  if (!item || preco == null || !hora) return { tipo: 'sem_dado' }
  // Grava sob o ticker pedido: a brapi troca ticker renomeado (BRML3 → ALOS3),
  // e é pelo nome da carteira que as regras procuram.
  return { tipo: 'ok', linhas: [{ ticker: normalizarTicker(ticker), data: dataEmBrasilia(new Date(hora)), fechamento: preco }] }
}

export async function buscarHistorico(ticker: string, deps: DepsBrapi): Promise<ResultadoBrapi> {
  const corpo = await pedir(`${BASE}/stocks/historical?symbols=${encodeURIComponent(ticker)}&range=3mo&interval=1d`, deps)
  if (corpo === 'sem_dado' || corpo === 'limite') return { tipo: corpo }
  const item = Historico.parse(corpo).results?.[0]
  const linhas: Fechamento[] = (item?.data?.historicalDataPrice ?? []).flatMap((p) =>
    p.close == null ? [] : [{ ticker: normalizarTicker(ticker), data: dataEmBrasilia(new Date(p.date * 1000)), fechamento: p.close }],
  )
  return linhas.length ? { tipo: 'ok', linhas } : { tipo: 'sem_dado' }
}

const Uso = z.object({ usage: z.object({ planLimit: z.number(), currentUsage: z.number() }) })

/** Uso da cota nos últimos 30 dias, para avisar antes de ela acabar. */
export async function usoDaCota(deps: DepsBrapi): Promise<{ usado: number; limite: number }> {
  const corpo = await pedir(`${BASE}/user/usage`, deps)
  if (corpo === 'sem_dado' || corpo === 'limite') throw new Error(`brapi: uso da cota indisponível (${corpo})`)
  const { usage } = Uso.parse(corpo)
  return { usado: usage.currentUsage, limite: usage.planLimit }
}
