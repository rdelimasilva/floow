/**
 * Tipos e limites do diagnóstico da carteira.
 *
 * As regras são funções puras sobre um contexto já carregado do banco. Valores
 * em centavos, taxas em fração (1.0 = 100% do CDI). Dado ausente vira null,
 * nunca 0: uma regra sem o dado de que precisa não dispara.
 */
import { bancoEmissor } from '../openfinance/investments/emissores'
import { brl } from '../cfo/formato'

export type Perfil = 'conservador' | 'moderado' | 'arrojado'
export type Severidade = 'alta' | 'media' | 'info'
export type RegraId = 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R11' | 'R12'

export interface PosicaoDiagnostico {
  assetId: string
  nome: string
  classe: string
  subtipo: string | null
  ticker: string | null
  valorCents: number
  cnpjEmissor: string | null
  emissor: string | null
  indexador: string | null
  percentualIndexador: number | null
  taxaPrefixada: number | null
  /** aaaa-MM-dd */
  vencimento: string | null
  titular: string | null
}

export interface ContaDeCaixa {
  tipo: 'checking' | 'savings' | 'cash'
  saldoCents: number
}

export interface ContextoDiagnostico {
  /** aaaa-MM-dd */
  hoje: string
  posicoes: PosicaoDiagnostico[]
  caixa: ContaDeCaixa[]
  gastoMensalCents: number | null
  cdi12m: number | null
  perfil: Perfil | null
}

export interface Achado {
  ruleId: RegraId
  severidade: Severidade
  titulo: string
  posicoes: string[]
  metricas: Record<string, number>
  impactoAnualCents: number | null
  exposicaoCents: number | null
  dica: string
}

export interface Diagnostico {
  achados: Achado[]
  impactoAnualCents: number
  patrimonioCents: number
}

export const CONFIG_DIAGNOSTICO = {
  r02MargemPp: 0.02,
  r02AltaCents: 200_000,
  r03TaxaMinima: 0.9,
  r03MesesColchao: 6,
  r04MesesColchao: 3,
  r05Limite: 0.2,
  r05Alta: 0.3,
  r06LimiteFgcCents: 25_000_000,
  r07Limite: 0.8,
  r11Dias: 30,
  /** Poupança com Selic acima de 8,5%: 0,5% a.m. */
  poupancaAnual: 0.0617,
  subtiposFgc: ['CDB', 'LCI', 'LCA', 'LC', 'RDB'],
  /** Renda fixa pós-CDI que costuma ter resgate diário; o banco não informa. */
  subtiposLiquidezProvavel: ['CDB', 'RDB'],
} as const

export function patrimonioCents(ctx: ContextoDiagnostico): number {
  const posicoes = ctx.posicoes.reduce((s, p) => s + p.valorCents, 0)
  const caixa = ctx.caixa.reduce((s, c) => s + c.saldoCents, 0)
  return posicoes + caixa
}

export function ehPosCdi(p: PosicaoDiagnostico): boolean {
  const ix = p.indexador?.trim().toUpperCase()
  return (ix === 'CDI' || ix === 'DI') && p.percentualIndexador !== null
}

/** Banco do emissor; sem mapeamento, a raiz do CNPJ; sem CNPJ, o próprio ativo. */
export function conglomerado(cnpj: string | null, assetId: string): string {
  const banco = bancoEmissor(cnpj)
  if (banco) return banco
  const digitos = cnpj?.replace(/\D/g, '') ?? ''
  return digitos.length >= 8 ? digitos.slice(0, 8) : `ativo:${assetId}`
}

/** "R$ 48 mil" de R$ 10 mil para cima; abaixo disso, o valor inteiro. */
export function brlCurto(cents: number): string {
  if (Math.abs(cents) < 1_000_000) return brl(cents)
  return `R$ ${Math.round(cents / 100_000).toLocaleString('pt-BR')} mil`
}

const PESO: Record<Severidade, number> = { alta: 0, media: 1, info: 2 }

export function ordenarAchados(achados: Achado[]): Achado[] {
  const valor = (a: Achado) => a.impactoAnualCents ?? a.exposicaoCents ?? 0
  return [...achados].sort(
    (a, b) => PESO[a.severidade] - PESO[b.severidade] || valor(b) - valor(a),
  )
}

/** Dias corridos de `de` até `ate`, ambos aaaa-MM-dd. */
export function diasEntre(de: string, ate: string): number {
  const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  return Math.round((utc(ate) - utc(de)) / 86_400_000)
}

/** Fração em percentual com vírgula: pctDe(0.109, 1) => "10,9%". */
export function pctDe(fracao: number, casas = 0): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}
