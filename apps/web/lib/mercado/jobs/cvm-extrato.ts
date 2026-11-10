import { parseCadastro, parseExtrato, type FundoCvm } from '@floow/core-finance'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'

const URL_EXTRATO = 'https://dados.cvm.gov.br/dados/FI/DOC/EXTRATO/DADOS/extrato_fi_'
const URL_CADASTRO = 'https://dados.cvm.gov.br/dados/FI/CAD/DADOS/cad_fi.csv'

async function baixarLatin1(fetchImpl: typeof fetch, url: string): Promise<string | null> {
  const r = await fetchImpl(url)
  if (r.status === 404) return null
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

  // Em janeiro o extrato do ano novo ainda não existe ou vem quase vazio: lê o
  // do ano anterior também, e fica com o registro mais recente de cada fundo.
  const ano = deps.hoje.getUTCFullYear()
  const anos = deps.hoje.getUTCMonth() === 0 ? [ano - 1, ano] : [ano]
  const porCnpj = new Map<string, FundoCvm>()
  let invalidas = 0
  let baixados = 0
  for (const a of anos) {
    const csv = await baixarLatin1(deps.fetch, `${URL_EXTRATO}${a}.csv`)
    if (csv === null) continue
    baixados++
    const p = parseExtrato(csv, deps.cnpjs)
    invalidas += p.invalidas
    for (const f of p.fundos) {
      const atual = porCnpj.get(f.cnpj)
      if (!atual || f.dataReferencia > atual.dataReferencia) porCnpj.set(f.cnpj, f)
    }
  }
  if (baixados === 0) throw new Error(`CVM respondeu 404 para o extrato de ${anos.join(' e ')}`)
  const fundos = [...porCnpj.values()]

  const faltam = new Set([...deps.cnpjs].filter((c) => !fundos.some((f) => f.cnpj === c)))
  if (faltam.size > 0) {
    const csv = await baixarLatin1(deps.fetch, URL_CADASTRO)
    if (csv === null) throw new Error(`CVM respondeu 404 em ${URL_CADASTRO}`)
    const cadastro = parseCadastro(csv, faltam)
    fundos.push(...cadastro.fundos)
    invalidas += cadastro.invalidas
    for (const f of cadastro.fundos) faltam.delete(f.cnpj)
  }

  await deps.repo.gravarFundos(fundos)
  return { linhas: fundos.length, invalidas, total: fundos.length + invalidas, naoEncontrados: faltam.size }
}
