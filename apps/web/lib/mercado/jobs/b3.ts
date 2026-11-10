import { buscarCotacao, type Fechamento } from '../brapi'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

/** Abaixo dos 60 s da função no plano Hobby, com folga para gravar. */
const PRAZO_MS = 50_000

/**
 * Fechamento do dia de cada ticker das carteiras, um por chamada (plano grátis
 * da brapi). Começa pelos que estão há mais tempo sem fechamento; se o prazo
 * ou a cota acabarem, o resto fica para a próxima execução.
 */
export async function rodarB3(deps: {
  fetch: typeof fetch
  repo: RepoMercado
  token: string | undefined
  tickers: string[]
  agora?: () => number
  prazoMs?: number
  esperar?: (ms: number) => Promise<void>
}): Promise<ResultadoDoCorpo> {
  if (!deps.token) throw new Error('BRAPI_TOKEN ausente')
  const agora = deps.agora ?? Date.now
  const inicio = agora()
  const prazo = deps.prazoMs ?? PRAZO_MS
  const linhas: Fechamento[] = []

  for (const ticker of await deps.repo.tickersPorFechamentoMaisAntigo(deps.tickers)) {
    if (agora() - inicio >= prazo) break
    const r = await buscarCotacao(ticker, { fetch: deps.fetch, token: deps.token, esperar: deps.esperar })
    if (r.tipo === 'limite') break
    if (r.tipo === 'ok') linhas.push(...r.linhas)
    // sem_dado: ticker sem pregão ou que saiu da bolsa; não é arquivo quebrado.
  }

  await deps.repo.gravarFechamentos(linhas)
  return { linhas: linhas.length, invalidas: 0, total: linhas.length }
}
