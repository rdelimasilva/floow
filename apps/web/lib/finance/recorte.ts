/**
 * O recorte compartilhado entre as telas de finanças: período + contas.
 *
 * Fica num cookie próprio (`recorte`). Quem só tem os cookies antigos
 * (`tx-filters`, `tx-accounts`) herda o que tinha em Transações.
 * Atalho de período vai como relativo (`period=month`) e volta com as datas
 * do dia da volta; datas digitadas à mão voltam como estão.
 *
 * Datas vazias significam ponta aberta ("Todo o período").
 *
 * Contas: a chegada na tela preserva as contas do cookie que a tela não lista
 * (ex.: investimento); mexer no seletor da tela substitui as contas do recorte.
 * O recorte não é alterado por essa tela até o usuário mexer no seletor dela.
 */
import {
  FILTERS_COOKIE, PERIOD_KEYS, detectActivePeriod, getPeriodDates, hojeEmSaoPaulo,
  mesInteiro, restaurarFiltros, type PeriodKey,
} from './filtros-lembrados'

export const RECORTE_COOKIE = 'recorte'
export const EVENTO_RECORTE_GRAVADO = 'recorte-gravado'

export type Recorte = { startDate: string; endDate: string; accountIds: string[] }

type Params = Record<string, string | undefined>

/** "Este mês", sem filtro de conta. */
export function RECORTE_PADRAO(hoje: string = hojeEmSaoPaulo()): Recorte {
  return { ...getPeriodDates('month', hoje), accountIds: [] }
}

const MES = /^\d{4}-\d{2}-01$/
const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Chaves da URL que compõem o recorte. */
export const CHAVES_DO_RECORTE = ['startDate', 'endDate', 'accountId', 'month']

/** Dia que existe no calendário (2026-02-30 não): ida e volta pelo Date. */
export function diaExiste(v: string): boolean {
  if (!DIA.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

const lista = (v: string | null | undefined) => (v ? v.split(',').filter(Boolean) : [])

export function serializarRecorte(r: Recorte, hoje: string = hojeEmSaoPaulo()): string {
  // `v=1` mantém o cookie não vazio quando o recorte é "tudo aberto";
  // sem ele, a leitura cairia nos cookies antigos.
  const out = new URLSearchParams({ v: '1' })
  const period = detectActivePeriod(r.startDate, r.endDate, hoje)
  if (period) out.set('period', period)
  else {
    if (r.startDate) out.set('startDate', r.startDate)
    if (r.endDate) out.set('endDate', r.endDate)
  }
  if (r.accountIds.length) out.set('accounts', r.accountIds.join(','))
  return out.toString()
}

function lerCookieNovo(valor: string, hoje: string): Recorte {
  // O cliente grava com encodeURIComponent; se o servidor não decodificou, decodifica aqui.
  let bruto = valor
  if (!valor.includes('=') && valor.includes('%')) {
    try { bruto = decodeURIComponent(valor) } catch { bruto = '' }
  }
  const p = new URLSearchParams(bruto)
  const period = p.get('period')
  const datas = period && (PERIOD_KEYS as string[]).includes(period)
    ? getPeriodDates(period as PeriodKey, hoje)
    : { startDate: p.get('startDate') ?? '', endDate: p.get('endDate') ?? '' }
  return { ...datas, accountIds: lista(p.get('accounts')) }
}

export function lerRecorte(cookies: Params, hoje: string = hojeEmSaoPaulo()): Recorte | null {
  if (cookies[RECORTE_COOKIE]) return lerCookieNovo(cookies[RECORTE_COOKIE]!, hoje)
  // Cookies antigos: só o período de tx-filters (busca, tipo etc. não são recorte).
  const antigo = cookies[FILTERS_COOKIE] ? restaurarFiltros(cookies[FILTERS_COOKIE]!, hoje) : null
  const r: Recorte = {
    startDate: antigo?.get('startDate') ?? '',
    endDate: antigo?.get('endDate') ?? '',
    accountIds: lista(cookies['tx-accounts']),
  }
  return r.startDate || r.endDate || r.accountIds.length ? r : null
}

/** Só as chaves que a URL traz. `month=YYYY-MM-01` vira o mês inteiro. */
export function recorteDaUrl(params: Params): Partial<Recorte> {
  const out: Partial<Recorte> = {}
  // Valor malformado na URL (link velho, digitado) é ignorado em vez de virar data inválida.
  if (params.month && MES.test(params.month) && diaExiste(params.month)) Object.assign(out, mesInteiro(params.month.slice(0, 7), 0))
  if (params.startDate !== undefined && (params.startDate === '' || diaExiste(params.startDate))) out.startDate = params.startDate
  if (params.endDate !== undefined && (params.endDate === '' || diaExiste(params.endDate))) out.endDate = params.endDate
  if (params.accountId !== undefined) out.accountIds = lista(params.accountId)
  return out
}

export function temRecorteNaUrl(params: Params): boolean {
  return CHAVES_DO_RECORTE.some((k) => params[k] !== undefined)
}

/** Conta que a tela não conhece sai; as outras ficam. */
export function contasValidas(ids: string[], permitidas: string[]): string[] {
  return ids.filter((id) => permitidas.includes(id))
}

/** Telas de mês não aceitam ponta aberta: sem fim, vale o mês de hoje. */
export function mesParaTelaDeMes(r: Recorte | null, hoje: string = hojeEmSaoPaulo()): string {
  const fim = r?.endDate && DIA.test(r.endDate) ? r.endDate : hoje
  return `${fim.slice(0, 7)}-01`
}

/**
 * Para onde redirecionar para a URL refletir o recorte. Null quando a URL já
 * escolheu o seu, não há recorte, ou nada mudaria (evita laço de redirect).
 * Contas só vão quando a tela pede (`opts.contas`).
 */
export function destinoComRecorte(
  path: string, params: Params, r: Recorte | null, modo: 'intervalo' | 'mes', opts?: { contas?: boolean },
): string | null {
  if (!r || temRecorteNaUrl(params)) return null
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v)
  const antes = q.toString()
  if (modo === 'mes') q.set('month', mesParaTelaDeMes(r))
  else {
    if (r.startDate) q.set('startDate', r.startDate)
    if (r.endDate) q.set('endDate', r.endDate)
    if (opts?.contas && r.accountIds.length) q.set('accountId', r.accountIds.join(','))
  }
  const depois = q.toString()
  return depois === antes ? null : `${path}?${depois}`
}

/** Funde o parcial no recorte atual; sem recorte atual, parte do padrão. */
export function fundirRecorte(atual: Recorte | null, parcial: Partial<Recorte>, hoje?: string): Recorte {
  return { ...(atual ?? RECORTE_PADRAO(hoje)), ...parcial }
}

/** Cliente: grava o recorte antes de navegar, para o servidor lê-lo já nesta ida. */
export function recorteDoNavegador(): Recorte | null {
  const cookies: Params = {}
  for (const par of document.cookie.split('; ')) {
    const i = par.indexOf('=')
    if (i > 0) cookies[par.slice(0, i)] = par.slice(i + 1)
  }
  return lerRecorte(cookies)
}

export function gravarRecorte(parcial: Partial<Recorte>): void {
  const r = fundirRecorte(recorteDoNavegador(), parcial)
  document.cookie = `${RECORTE_COOKIE}=${encodeURIComponent(serializarRecorte(r))}; path=/; max-age=31536000; SameSite=Lax`
  // O menu lê o cookie na montagem; sem o aviso, o link dele ficaria com o recorte antigo.
  window.dispatchEvent(new Event(EVENTO_RECORTE_GRAVADO))
}
