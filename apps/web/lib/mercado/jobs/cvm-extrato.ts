import { parseCadastro, parseExtrato } from '@floow/core-finance'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

const URL_EXTRATO = 'https://dados.cvm.gov.br/dados/FI/DOC/EXTRATO/DADOS/extrato_fi_'
const URL_CADASTRO = 'https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv'

async function baixarLatin1(fetchImpl: typeof fetch, url: string): Promise<string> {
  const r = await fetchImpl(url)
  if (!r.ok) throw new Error(`CVM respondeu ${r.status} em ${url}`)
  return new TextDecoder('latin1').decode(await r.arrayBuffer())
}

/**
 * Taxa e prazo de resgate dos fundos das carteiras. O extrato do ano cobre
 * uns 5.700 fundos; quem não está nele sai do cadastro antigo (cad_fi.csv),
 * que tem a taxa mas não o prazo.
 */
export async function rodarCvmExtrato(deps: {
  fetch: typeof fetch
  repo: RepoMercado
  hoje: Date
  cnpjs: Set<string>
}): Promise<ResultadoDoCorpo> {
  if (deps.cnpjs.size === 0) return { linhas: 0, invalidas: 0, total: 0, naoEncontrados: 0 }

  const ano = deps.hoje.getUTCFullYear()
  const extrato = parseExtrato(await baixarLatin1(deps.fetch, `${URL_EXTRATO}${ano}.csv`), deps.cnpjs)
  const fundos = [...extrato.fundos]
  let invalidas = extrato.invalidas

  const faltam = new Set([...deps.cnpjs].filter((c) => !fundos.some((f) => f.cnpj === c)))
  if (faltam.size > 0) {
    const cadastro = parseCadastro(await baixarLatin1(deps.fetch, URL_CADASTRO), faltam)
    fundos.push(...cadastro.fundos)
    invalidas += cadastro.invalidas
    for (const f of cadastro.fundos) faltam.delete(f.cnpj)
  }

  await deps.repo.gravarFundos(fundos)
  return { linhas: fundos.length, invalidas, total: fundos.length + invalidas, naoEncontrados: faltam.size }
}
