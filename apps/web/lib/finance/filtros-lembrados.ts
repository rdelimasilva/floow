/**
 * Filtros da tela de Transações que sobrevivem à saída da tela.
 *
 * O cookie guarda o recorte (conta, busca, período, tipo, categoria, valor,
 * ordenação, futuro) — não a página nem o tamanho dela, que têm dono próprio.
 * Período escolhido por pílula é guardado como período RELATIVO (`period=month`)
 * e volta com as datas do dia da volta; datas digitadas à mão voltam como estão.
 *
 * Módulo puro: roda no servidor (restaurar) e no cliente (gravar).
 */

export const FILTERS_COOKIE = 'tx-filters'

export type PeriodKey =
  | 'lastMonth' | 'last3Months' | 'last12Months' | 'lastYear'
  | 'today' | 'month' | 'year'
  | 'nextMonth' | 'next3Months' | 'next6Months' | 'nextYear'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  lastMonth: 'Mês passado',
  last3Months: 'Últimos 3 meses',
  last12Months: 'Últimos 12 meses',
  lastYear: 'Ano passado',
  today: 'Hoje',
  month: 'Este mês',
  year: 'Este ano',
  nextMonth: 'Próximo mês',
  next3Months: 'Próximos 3 meses',
  next6Months: 'Próximos 6 meses',
  nextYear: 'Próximo ano',
}

/**
 * A tela mostra os atalhos em três grupos: passado, presente e futuro.
 *
 * - "Mês passado", "Ano passado", "Próximo mês" e "Próximo ano" são blocos de
 *   calendário inteiros: em out/2026, "Ano passado" é jan–dez de 2025.
 * - "Últimos N meses" e "Próximos N meses" contam o mês atual e param em hoje:
 *   em 13/10, "Últimos 3 meses" é 01/08–13/10 e "Próximos 3 meses" é 13/10–31/12.
 *   Quem pede os últimos 3 meses quer ver o que já gastou neste mês também.
 */
export const PERIOD_GROUPS: { label: string; keys: PeriodKey[] }[] = [
  { label: 'Passado', keys: ['lastMonth', 'last3Months', 'last12Months', 'lastYear'] },
  { label: 'Presente', keys: ['today', 'month', 'year'] },
  { label: 'Futuro', keys: ['nextMonth', 'next3Months', 'next6Months', 'nextYear'] },
]

// Ordem de desempate do `detectActivePeriod`: o presente primeiro, para que em
// 31/12 o intervalo jan–dez acenda "Este ano" e não "Últimos 12 meses".
const PERIOD_KEYS: PeriodKey[] = [
  ...PERIOD_GROUPS[1].keys, ...PERIOD_GROUPS[0].keys, ...PERIOD_GROUPS[2].keys,
]

// Tudo que é recorte. `page`/`pageSize` ficam de fora de propósito.
const FILTER_KEYS = [
  'accountId', 'search', 'startDate', 'endDate', 'future',
  'types', 'categoryIds', 'minAmount', 'maxAmount', 'sortBy', 'sortDir', 'cardDigits',
] as const

/** O dia de hoje no calendário do usuário, e não no UTC do servidor. */
export function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Aritmética em UTC só para montar 'YYYY-MM-DD' — o dia 0 vira o último do mês anterior.
function dia(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10)
}

export function getPeriodDates(key: PeriodKey, hoje: string = hojeEmSaoPaulo()): { startDate: string; endDate: string } {
  const [y, m1] = hoje.split('-').map(Number)
  const m = m1 - 1
  switch (key) {
    case 'lastMonth':
      return { startDate: dia(y, m - 1, 1), endDate: dia(y, m, 0) }
    case 'last3Months':
      return { startDate: dia(y, m - 2, 1), endDate: hoje }
    case 'last12Months':
      return { startDate: dia(y, m - 11, 1), endDate: hoje }
    case 'lastYear':
      return { startDate: dia(y - 1, 0, 1), endDate: dia(y - 1, 11, 31) }
    case 'today':
      return { startDate: hoje, endDate: hoje }
    case 'month':
      return { startDate: dia(y, m, 1), endDate: dia(y, m + 1, 0) }
    case 'year':
      return { startDate: dia(y, 0, 1), endDate: dia(y, 11, 31) }
    case 'nextMonth':
      return { startDate: dia(y, m + 1, 1), endDate: dia(y, m + 2, 0) }
    case 'next3Months':
      return { startDate: hoje, endDate: dia(y, m + 3, 0) }
    case 'next6Months':
      return { startDate: hoje, endDate: dia(y, m + 6, 0) }
    case 'nextYear':
      return { startDate: dia(y + 1, 0, 1), endDate: dia(y + 1, 11, 31) }
  }
}

export function detectActivePeriod(startDate: string, endDate: string, hoje: string = hojeEmSaoPaulo()): PeriodKey | null {
  if (!startDate || !endDate) return null
  for (const key of PERIOD_KEYS) {
    const { startDate: s, endDate: e } = getPeriodDates(key, hoje)
    if (s === startDate && e === endDate) return key
  }
  return null
}

/** O que vai para o cookie, a partir da URL que a tela vai mostrar. */
export function serializarFiltros(url: URLSearchParams, hoje: string = hojeEmSaoPaulo()): string {
  const out = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const v = url.get(key)
    if (v) out.set(key, v)
  }
  const period = detectActivePeriod(out.get('startDate') ?? '', out.get('endDate') ?? '', hoje)
  if (period) {
    out.delete('startDate')
    out.delete('endDate')
    out.set('period', period)
  }
  return out.toString()
}

/** Os parâmetros de URL que o cookie pede — só chaves conhecidas. */
export function restaurarFiltros(cookie: string, hoje: string = hojeEmSaoPaulo()): URLSearchParams {
  // O cliente grava com encodeURIComponent; se quem leu não decodificou, decodifica aqui.
  const salvo = new URLSearchParams(!cookie.includes('=') && cookie.includes('%') ? safeDecode(cookie) : cookie)
  const out = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const v = salvo.get(key)
    if (v) out.set(key, v)
  }
  const period = salvo.get('period')
  if (period && (PERIOD_KEYS as string[]).includes(period)) {
    const { startDate, endDate } = getPeriodDates(period as PeriodKey, hoje)
    out.set('startDate', startDate)
    out.set('endDate', endDate)
  }
  return out
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return ''
  }
}

/** A URL já diz algum recorte? Então é escolha de quem chegou, não se restaura. */
export function temFiltroNaUrl(params: Record<string, string | undefined>): boolean {
  return FILTER_KEYS.some((key) => params[key] !== undefined)
}

/** Grava a seleção antes de navegar — o servidor lê o cookie já nesta ida. */
export function lembrarFiltros(url: URLSearchParams) {
  document.cookie = `${FILTERS_COOKIE}=${encodeURIComponent(serializarFiltros(url))}; path=/; max-age=31536000; SameSite=Lax`
}

/**
 * Para onde o menu leva em Transações, a partir dos cookies do navegador.
 *
 * Espelha os dois redirects da página (filtros lembrados e `tx-accounts`) e
 * leva o tamanho de página. O cache do navegador (staleTimes) guarda a tela
 * por URL: um `/transactions` puro guardado antes de o filtro mudar reabriria
 * o recorte antigo. Com a URL já filtrada, cada recorte tem a sua entrada.
 */
export function urlDeTransacoes(cookies: Record<string, string | undefined>, hoje: string = hojeEmSaoPaulo()): string {
  const destino = cookies[FILTERS_COOKIE] ? restaurarFiltros(cookies[FILTERS_COOKIE], hoje) : new URLSearchParams()
  const contas = cookies['tx-accounts']
  if (!destino.has('accountId') && contas) destino.set('accountId', contas)
  const pageSize = cookies['tx-page-size']
  if (pageSize) destino.set('pageSize', pageSize)
  const q = destino.toString()
  return q ? `/transactions?${q}` : '/transactions'
}
