import * as Sentry from '@sentry/nextjs'
import { buscarCotacao, usoDaCota as lerUsoDaCota, BrapiNaoAutorizada, type Fechamento } from '../brapi'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

/** Abaixo dos 60 s da função no plano Hobby, com folga para gravar. */
const PRAZO_MS = 50_000
/** Passou disso, a cota mensal do plano grátis está perto de acabar. */
const AVISO_COTA = 0.8

/**
 * Fechamento do dia de cada ticker das carteiras, um por chamada (plano grátis
 * da brapi). Começa pelos que estão há mais tempo sem fechamento; se o prazo
 * ou a cota acabarem, o resto fica para a próxima execução. Erro num ticker
 * só tira aquele ticker; nenhuma cotação no dia inteiro é falha do job.
 */
export async function rodarB3(deps: {
  fetch: typeof fetch
  repo: RepoMercado
  token: string | undefined
  tickers: string[]
  agora?: () => number
  prazoMs?: number
  esperar?: (ms: number) => Promise<void>
  usoDaCota?: () => Promise<{ usado: number; limite: number }>
  avisar?: (mensagem: string) => void
}): Promise<ResultadoDoCorpo> {
  const token = deps.token
  if (!token) throw new Error('BRAPI_TOKEN ausente')
  const agora = deps.agora ?? Date.now
  const inicio = agora()
  const prazo = deps.prazoMs ?? PRAZO_MS
  const brapi = { fetch: deps.fetch, token, esperar: deps.esperar }
  const linhas: Fechamento[] = []
  let semCotacao = 0
  let bateuNoLimite = false

  const fila = await deps.repo.tickersPorFechamentoMaisAntigo(deps.tickers)
  for (const [i, ticker] of fila.entries()) {
    if (agora() - inicio >= prazo) break
    try {
      const r = await buscarCotacao(ticker, brapi)
      if (r.tipo === 'limite') {
        bateuNoLimite = true
        semCotacao += fila.length - i
        break
      }
      if (r.tipo === 'ok') linhas.push(...r.linhas)
      else semCotacao++ // sem pregão ou saiu da bolsa
    } catch (e) {
      if (e instanceof BrapiNaoAutorizada) throw e
      semCotacao++
    }
  }

  await deps.repo.gravarFechamentos(linhas)

  try {
    const { usado, limite } = await (deps.usoDaCota ?? (() => lerUsoDaCota(brapi)))()
    if (limite > 0 && usado / limite > AVISO_COTA) {
      const msg = `mercado: brapi em ${Math.round((usado / limite) * 100)}% da cota (${usado} de ${limite})`
      ;(deps.avisar ?? ((m: string) => Sentry.captureMessage(m, { level: 'warning', tags: { mercado: 'b3' } })))(msg)
    }
  } catch {
    // Ler o uso é só para o aviso; não pode derrubar um job que já gravou.
  }

  if (fila.length > 0 && linhas.length === 0) {
    throw new Error(bateuNoLimite ? 'brapi: limite da cota atingido, nenhuma cotação gravada' : 'brapi: nenhuma cotação gravada')
  }
  return { linhas: linhas.length, invalidas: 0, total: linhas.length, naoEncontrados: semCotacao }
}
