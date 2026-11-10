import { linhaDoInforme, type CotaFundo } from '@floow/core-finance'
import type { RepoMercado } from '../repo'
import type { ResultadoDoCorpo } from '../execucao'
import { linhasDoZip } from '../unzip'

const URL_INFORME = 'https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_'

const aaaamm = (d: Date) => d.toISOString().slice(0, 7).replace('-', '')

/** Mês corrente; nos 5 primeiros dias, o anterior também, porque o do mês novo ainda vem quase vazio. */
function mesesParaBaixar(hoje: Date): string[] {
  const meses = [aaaamm(hoje)]
  if (hoje.getUTCDate() <= 5) meses.push(aaaamm(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1))))
  return meses
}

export async function rodarCvmCotas(deps: {
  fetch: typeof fetch
  repo: RepoMercado
  hoje: Date
  cnpjs: Set<string>
  meses?: string[]
}): Promise<ResultadoDoCorpo> {
  if (deps.cnpjs.size === 0) return { linhas: 0, invalidas: 0, total: 0, naoEncontrados: 0 }

  // O informe pode trazer a cota sob o CNPJ da classe (CVM 175). O de-para vem
  // do job do extrato; aqui a cota volta para o CNPJ que está na carteira.
  const classeParaCnpj = await deps.repo.mapaClasseParaCnpj()
  const procurados = new Set(deps.cnpjs)
  for (const [classe, cnpj] of classeParaCnpj) if (deps.cnpjs.has(cnpj)) procurados.add(classe)

  // Uma cota por fundo e dia. Com várias subclasses no mesmo dia, fica a de
  // maior patrimônio: não sabemos em qual a pessoa está, e o upsert não aceita
  // a mesma chave duas vezes no mesmo INSERT.
  const cotas = new Map<string, CotaFundo>()
  const achados = new Set<string>()
  let invalidas = 0
  let baixados = 0

  for (const mes of deps.meses ?? mesesParaBaixar(deps.hoje)) {
    const r = await deps.fetch(`${URL_INFORME}${mes}.zip`)
    // Mês que a CVM ainda não publicou responde 404; o outro mês pode ter vindo.
    if (r.status === 404) continue
    if (!r.ok || !r.body) throw new Error(`CVM respondeu ${r.status} para o informe ${mes}`)
    baixados++
    let cabecalho: string[] | null = null
    await linhasDoZip(r.body, (linha) => {
      if (!cabecalho) {
        cabecalho = linha.split(';')
        return
      }
      const c = linhaDoInforme(cabecalho, linha, procurados)
      if (c === 'fora') return
      if (c === 'invalida') {
        invalidas++
        return
      }
      const cnpj = deps.cnpjs.has(c.cnpj) ? c.cnpj : (classeParaCnpj.get(c.cnpj) ?? c.cnpj)
      achados.add(cnpj)
      const chave = `${cnpj}|${c.data}`
      const atual = cotas.get(chave)
      if (!atual || (c.patrimonio ?? 0) > (atual.patrimonio ?? 0)) cotas.set(chave, { ...c, cnpj })
    })
  }
  if (baixados === 0) throw new Error('CVM: nenhum informe diário disponível')

  await deps.repo.gravarCotas([...cotas.values()])
  const naoEncontrados = [...deps.cnpjs].filter((c) => !achados.has(c)).length
  return { linhas: cotas.size, invalidas, total: cotas.size + invalidas, naoEncontrados }
}
