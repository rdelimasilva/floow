import Papa from 'papaparse'
import { soDigitos } from './util'

// Arquivos de dados abertos da CVM: `;`, ponto decimal, datas ISO, CNPJ com
// pontuação. Decodificar o latin-1 fica com quem baixa; aqui já chega string.

/** subclasse: ID_SUBCLASSE do informe, '' quando a linha é da classe. Subclasses têm cotas diferentes. */
export type CotaFundo = { cnpj: string; data: string; cota: number; patrimonio: number | null; subclasse: string }

export type FundoCvm = {
  cnpj: string
  nome: string
  classeAnbima: string | null
  taxaAdm: number | null
  taxaPerformance: number | null
  diasConversaoResgate: number | null
  diasPagamentoResgate: number | null
  dataReferencia: string
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function numero(s: string | undefined): number | null {
  const t = s?.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function inteiro(s: string | undefined): number | null {
  const n = numero(s)
  return n !== null && Number.isInteger(n) ? n : null
}

const texto = (s: string | undefined) => s?.trim() || null

/**
 * O extrato traz valores como 262600.000000 no campo de taxa de administração
 * (% a.a.); acima de 10% não é taxa. A de performance é % do que passa do
 * benchmark, e 20% é comum, então o teto dela é 100.
 */
export function taxaPlausivel(v: number | null, teto = 10): number | null {
  return v !== null && v >= 0 && v <= teto ? v : null
}

/**
 * Uma linha do informe diário. Roda sobre centenas de milhares de linhas por
 * arquivo, então devolve 'fora' antes de validar quando o fundo não interessa.
 */
export function linhaDoInforme(cabecalho: string[], linha: string, cnpjs: Set<string>): CotaFundo | 'fora' | 'invalida' {
  const campos = linha.split(';')
  const valor = (nome: string) => campos[cabecalho.indexOf(nome)]
  const cnpj = soDigitos(valor('CNPJ_FUNDO_CLASSE') ?? '')
  if (!cnpjs.has(cnpj)) return 'fora'
  const data = valor('DT_COMPTC')?.trim() ?? ''
  const cota = numero(valor('VL_QUOTA'))
  if (!DATA_ISO.test(data) || cota === null) return 'invalida'
  return { cnpj, data, cota, patrimonio: numero(valor('VL_PATRIM_LIQ')), subclasse: valor('ID_SUBCLASSE')?.trim() ?? '' }
}

function linhas(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv, { delimiter: ';', header: true, skipEmptyLines: true }).data
}

export function parseExtrato(csv: string, cnpjs: Set<string>): { fundos: FundoCvm[]; invalidas: number } {
  const porCnpj = new Map<string, FundoCvm>()
  let invalidas = 0
  for (const l of linhas(csv)) {
    const cnpj = soDigitos(l.CNPJ_FUNDO_CLASSE ?? '')
    if (!cnpjs.has(cnpj)) continue
    const data = l.DT_COMPTC?.trim() ?? ''
    const nome = texto(l.DENOM_SOCIAL)
    if (!DATA_ISO.test(data) || !nome) {
      invalidas++
      continue
    }
    const atual = porCnpj.get(cnpj)
    if (atual && atual.dataReferencia >= data) continue
    porCnpj.set(cnpj, {
      cnpj,
      nome,
      classeAnbima: texto(l.CLASSE_ANBIMA),
      taxaAdm: taxaPlausivel(numero(l.TAXA_ADM)),
      taxaPerformance: taxaPlausivel(numero(l.TAXA_PERFM), 100),
      diasConversaoResgate: inteiro(l.QT_DIA_CONVERSAO_COTA),
      diasPagamentoResgate: inteiro(l.QT_DIA_PAGTO_RESGATE),
      dataReferencia: data,
    })
  }
  return { fundos: [...porCnpj.values()], invalidas }
}

/** Cadastro legado (cad_fi.csv): reserva para fundo que não está no extrato. Não traz prazo de resgate. */
export function parseCadastro(csv: string, cnpjs: Set<string>): { fundos: FundoCvm[]; invalidas: number } {
  const porCnpj = new Map<string, FundoCvm>()
  let invalidas = 0
  for (const l of linhas(csv)) {
    const cnpj = soDigitos(l.CNPJ_FUNDO ?? '')
    if (!cnpjs.has(cnpj) || l.SIT?.trim() === 'CANCELADA') continue
    const data = l.DT_INI_SIT?.trim() ?? ''
    const nome = texto(l.DENOM_SOCIAL)
    if (!DATA_ISO.test(data) || !nome) {
      invalidas++
      continue
    }
    porCnpj.set(cnpj, {
      cnpj,
      nome,
      classeAnbima: texto(l.CLASSE_ANBIMA),
      taxaAdm: taxaPlausivel(numero(l.TAXA_ADM)),
      taxaPerformance: taxaPlausivel(numero(l.TAXA_PERFM), 100),
      diasConversaoResgate: null,
      diasPagamentoResgate: null,
      dataReferencia: data,
    })
  }
  return { fundos: [...porCnpj.values()], invalidas }
}
