import { CODIGOS_SGS, parseSgs, type Indicador, type Serie } from '@floow/core-finance'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

/**
 * Janela de busca por série. Pega os últimos dias de novo a cada execução para
 * cobrir feriado e atraso de publicação; o upsert não duplica. O IPCA sai uma
 * vez por mês, com mais de 30 dias de atraso.
 */
const JANELA_DIAS: Record<Serie, number> = { cdi: 10, selic: 10, ipca: 70 }

const DIA_MS = 86_400_000

const dataSgs = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')

export async function rodarBcb(deps: {
  fetch: typeof fetch
  repo: RepoMercado
  hoje: Date
  janelaDias?: number
}): Promise<ResultadoDoCorpo> {
  const linhas: Indicador[] = []
  let invalidas = 0
  for (const serie of Object.keys(CODIGOS_SGS) as Serie[]) {
    const inicio = new Date(deps.hoje.getTime() - (deps.janelaDias ?? JANELA_DIAS[serie]) * DIA_MS)
    const url =
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${CODIGOS_SGS[serie]}/dados?formato=json` +
      `&dataInicial=${dataSgs(inicio)}&dataFinal=${dataSgs(deps.hoje)}`
    const r = await deps.fetch(url)
    if (!r.ok) throw new Error(`BCB respondeu ${r.status} para ${serie}`)
    const p = parseSgs(serie, await r.json())
    linhas.push(...p.linhas)
    invalidas += p.invalidas
  }
  await deps.repo.gravarIndicadores(linhas)
  return { linhas: linhas.length, invalidas, total: linhas.length + invalidas }
}
