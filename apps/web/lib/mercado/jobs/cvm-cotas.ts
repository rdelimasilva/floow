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

/**
 * Uma cota por fundo e dia. Subclasses do mesmo fundo têm cotas bem diferentes
 * (1,13 e 0,81 no mesmo dia), e trocar de subclasse no meio da série inventa
 * retorno. Fica a de maior patrimônio no último dia do arquivo, em todos os
 * dias: não sabemos em qual a pessoa está, e é a mais representativa.
 */
function umaSubclassePorFundo(linhas: CotaFundo[]): CotaFundo[] {
  const escolhida = new Map<string, CotaFundo>()
  for (const l of linhas) {
    const atual = escolhida.get(l.cnpj)
    const maisRecente = !atual || l.data > atual.data
    const mesmoDiaMaior = atual && l.data === atual.data && (l.patrimonio ?? 0) > (atual.patrimonio ?? 0)
    if (maisRecente || mesmoDiaMaior) escolhida.set(l.cnpj, l)
  }
  const porChave = new Map<string, CotaFundo>()
  for (const l of linhas) if (escolhida.get(l.cnpj)!.subclasse === l.subclasse) porChave.set(`${l.cnpj}|${l.data}`, l)
  return [...porChave.values()]
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

  const linhas: CotaFundo[] = []
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
      linhas.push({ ...c, cnpj })
    })
  }
  if (baixados === 0) throw new Error('CVM: nenhum informe diário disponível')

  const cotas = umaSubclassePorFundo(linhas)
  await deps.repo.gravarCotas(cotas)
  const naoEncontrados = [...deps.cnpjs].filter((c) => !achados.has(c)).length
  return { linhas: cotas.length, invalidas, total: cotas.length + invalidas, naoEncontrados }
}
