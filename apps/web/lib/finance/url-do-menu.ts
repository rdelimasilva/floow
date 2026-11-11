/**
 * Para onde o menu e a página de Transações levam, a partir do recorte
 * compartilhado (`recorte`) e do que Transações lembra à parte (`tx-filters`:
 * busca e filtros de coluna).
 *
 * O cache do navegador (staleTimes) guarda a tela por URL: um `/transactions`
 * puro guardado antes de o recorte mudar reabriria o recorte antigo. Com a URL
 * já filtrada, cada recorte tem a sua entrada.
 */
import { FILTERS_COOKIE, hojeEmSaoPaulo, restaurarFiltros, temFiltroNaUrl } from './filtros-lembrados'
import {
  RECORTE_COOKIE, RECORTE_PADRAO, contasValidas, destinoComRecorte, lerRecorte, mesParaTelaDeMes, temRecorteNaUrl, type Recorte,
} from './recorte'

type Params = Record<string, string | undefined>

/**
 * Redirect de Transações quando a URL chega sem recorte. `permitidas` são as
 * contas que a tela aceita (sem as de investimento); o recorte em si não muda.
 * Null quando a URL já está como deve.
 */
export function destinoDeTransacoes(
  params: Params, cookies: Params, permitidas: string[] | null, hoje: string = hojeEmSaoPaulo(),
): string | null {
  const r0 = lerRecorte(cookies, hoje) ?? RECORTE_PADRAO(hoje)
  const r: Recorte = permitidas ? { ...r0, accountIds: contasValidas(r0.accountIds, permitidas) } : r0
  let base = params
  // Busca e colunas voltam do último uso; período e contas vêm só do recorte.
  // Cookie vazio é "limpou tudo": não restaura.
  if (cookies[FILTERS_COOKIE] && !temFiltroNaUrl(params) && !temRecorteNaUrl(params)) {
    const lembrado = restaurarFiltros(cookies[FILTERS_COOKIE], hoje)
    for (const k of ['startDate', 'endDate', 'accountId']) lembrado.delete(k)
    if (lembrado.toString()) base = { ...Object.fromEntries(lembrado), ...params }
  }
  const destino = destinoComRecorte('/transactions', base, r, 'intervalo', { contas: true })
  // Recorte aberto não acrescenta nada, mas a busca restaurada ainda precisa ir para a URL.
  if (!destino && base !== params) return `/transactions?${new URLSearchParams(base as Record<string, string>)}`
  return destino
}

/** Href do menu para Transações, já no recorte lembrado. */
export function urlDeTransacoes(cookies: Params, hoje: string = hojeEmSaoPaulo()): string {
  const pageSize = cookies['tx-page-size']
  const params = pageSize ? { pageSize } : {}
  // Sem nada lembrado o menu não inventa período: a página abre em "Este mês".
  if (!cookies[RECORTE_COOKIE] && !cookies[FILTERS_COOKIE] && !cookies['tx-accounts']) {
    return pageSize ? `/transactions?pageSize=${pageSize}` : '/transactions'
  }
  return destinoDeTransacoes(params, cookies, null, hoje) ?? '/transactions'
}

/** Análises abre no recorte (a tela passa a lê-lo na Tarefa 6); Orçamentos, no mês dele. */
export function urlDeAnalises(cookies: Params, hoje: string = hojeEmSaoPaulo()): string {
  return destinoComRecorte('/cash-flow', {}, lerRecorte(cookies, hoje), 'intervalo', { contas: true }) ?? '/cash-flow'
}

export function urlDeOrcamento(href: string, cookies: Params, hoje: string = hojeEmSaoPaulo()): string {
  const r = lerRecorte(cookies, hoje)
  return r ? `${href}?month=${mesParaTelaDeMes(r, hoje)}` : href
}

/**
 * Transações só aplica contas de lançamento. Id que a tela não conhece sai da
 * URL (sem `accountId` se nada sobrar); o cookie não é tocado.
 */
export function destinoSoComContasValidas(params: Params, permitidas: string[]): string | null {
  if (params.accountId === undefined) return null
  const ids = params.accountId.split(',').filter(Boolean)
  const validas = contasValidas(ids, permitidas)
  if (validas.length === ids.length) return null
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined))
  if (validas.length) q.set('accountId', validas.join(','))
  else q.delete('accountId')
  return `/transactions?${q}`
}
