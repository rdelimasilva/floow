import { parseTesouro } from '@floow/core-finance'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

const URL_TESOURO =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv'

/** O CSV traz o histórico inteiro (~15 MB); grava só os dias depois do último já gravado. */
export async function rodarTesouro(deps: { fetch: typeof fetch; repo: RepoMercado }): Promise<ResultadoDoCorpo> {
  const r = await deps.fetch(URL_TESOURO)
  if (!r.ok) throw new Error(`Tesouro Transparente respondeu ${r.status}`)
  const p = parseTesouro(await r.text(), await deps.repo.ultimaDataTesouro())
  await deps.repo.gravarTesouro(p.linhas)
  return { linhas: p.linhas.length, invalidas: p.invalidas, total: p.linhas.length + p.invalidas }
}
