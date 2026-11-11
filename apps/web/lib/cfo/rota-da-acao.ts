/**
 * Para onde cada ação sugerida pelo Consultor leva. Os parâmetros precisam ser
 * os que a tela de destino lê: Transações entende `startDate`/`endDate`/
 * `categoryIds`, e Ritmo entende `month=YYYY-MM-01`.
 */

/** 'YYYY-MM' vira o primeiro e o último dia do mês. Qualquer outro formato, null. */
export function intervaloDoMes(mes: string): { startDate: string; endDate: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes)
  if (!m) return null
  const ano = Number(m[1])
  const mes0 = Number(m[2]) - 1
  if (mes0 < 0 || mes0 > 11) return null
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  return { startDate: `${mes}-01`, endDate: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

export function urlDeTransacoes(p: { period?: unknown; categoryId?: unknown }): string {
  const query = new URLSearchParams()
  const intervalo = typeof p.period === 'string' ? intervaloDoMes(p.period) : null
  if (intervalo) {
    query.set('startDate', intervalo.startDate)
    query.set('endDate', intervalo.endDate)
  }
  if (typeof p.categoryId === 'string' && p.categoryId) query.set('categoryIds', p.categoryId)
  const qs = query.toString()
  return qs ? `/transactions?${qs}` : '/transactions'
}

export function rotaDaAcao(tipo: string, p: Record<string, unknown>): string | null {
  switch (tipo) {
    case 'view_transactions':
      return urlDeTransacoes(p)
    case 'view_account':
      return typeof p.accountId === 'string' ? `/accounts/${p.accountId}` : '/accounts'
    case 'view_debts':
      return '/debts'
    case 'view_investments':
      return '/investments'
    case 'view_planning':
      return '/planning'
    case 'create_budget':
    case 'adjust_budget':
      return '/budgets/spending'
    case 'view_pacing':
      return typeof p.month === 'string' && intervaloDoMes(p.month)
        ? `/budgets/pacing?month=${p.month}-01`
        : '/budgets/pacing'
    default:
      return null
  }
}
