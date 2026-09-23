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

export type PeriodKey = 'today' | 'month' | 'quarter' | 'semester' | 'year'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  month: 'Este mês',
  quarter: 'Este trimestre',
  semester: 'Este semestre',
  year: 'Este ano',
}

const PERIOD_KEYS = Object.keys(PERIOD_LABELS) as PeriodKey[]

// Tudo que é recorte. `page`/`pageSize` ficam de fora de propósito.
const FILTER_KEYS = [
  'accountId', 'search', 'startDate', 'endDate', 'future',
  'types', 'categoryIds', 'minAmount', 'maxAmount', 'sortBy', 'sortDir',
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
    case 'today':
      return { startDate: hoje, endDate: hoje }
    case 'month':
      return { startDate: dia(y, m, 1), endDate: dia(y, m + 1, 0) }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return { startDate: dia(y, q * 3, 1), endDate: dia(y, q * 3 + 3, 0) }
    }
    case 'semester': {
      const s = m < 6 ? 0 : 1
      return { startDate: dia(y, s * 6, 1), endDate: dia(y, s * 6 + 6, 0) }
    }
    case 'year':
      return { startDate: dia(y, 0, 1), endDate: dia(y, 11, 31) }
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
