/**
 * Income aggregation engine — pure functions only.
 *
 * aggregateIncome: groups dividend/interest/amortization events by month.
 * estimateMonthlyIncome: estimates average monthly income over the last N months.
 *
 * This module is safe for client-side bundling (no DB runtime imports).
 *
 * Income event types: dividend, jcp (balde de dividendos), interest, amortization
 * Non-income types (filtered out): buy, sell, split
 */

/**
 * Input interface for a single income-related event.
 */
export interface IncomeEvent {
  eventType: string
  totalCents: number | null
  eventDate: Date
  assetTicker?: string
  assetName?: string
}

/**
 * Aggregated income for a single calendar month.
 */
export interface IncomeMonth {
  /** Month in YYYY-MM format */
  month: string
  /** Total income in cents from all income events in this month */
  totalCents: number
  /** Breakdown: dividend income in cents */
  dividendCents: number
  /** Breakdown: interest income in cents */
  interestCents: number
  /** Breakdown: amortization income in cents */
  amortizationCents: number
  /** Number of income events in this month */
  eventCount: number
}

// jcp é provento de ação como o dividendo — entra no mesmo balde.
const INCOME_EVENT_TYPES = new Set(['dividend', 'jcp', 'interest', 'amortization'])

/**
 * Pure function: aggregates income events by calendar month.
 *
 * @param events - Array of portfolio events (all types; non-income filtered out)
 * @returns Array of IncomeMonth entries, sorted descending by month (most recent first)
 */
export function aggregateIncome(events: IncomeEvent[]): IncomeMonth[] {
  if (events.length === 0) {
    return []
  }

  // Filter to income-generating events only
  const incomeEvents = events.filter(
    (e) => INCOME_EVENT_TYPES.has(e.eventType) && (e.totalCents ?? 0) > 0
  )

  if (incomeEvents.length === 0) {
    return []
  }

  // Group by YYYY-MM
  const monthMap = new Map<string, IncomeMonth>()

  for (const event of incomeEvents) {
    const date = event.eventDate
    // Use UTC methods to avoid timezone-induced month shifts when dates are parsed as UTC midnight
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const monthKey = `${year}-${month}`

    const entry = monthMap.get(monthKey) ?? {
      month: monthKey,
      totalCents: 0,
      dividendCents: 0,
      interestCents: 0,
      amortizationCents: 0,
      eventCount: 0,
    }

    const amount = event.totalCents ?? 0

    entry.totalCents += amount
    entry.eventCount += 1

    if (event.eventType === 'dividend' || event.eventType === 'jcp') {
      entry.dividendCents += amount
    } else if (event.eventType === 'interest') {
      entry.interestCents += amount
    } else if (event.eventType === 'amortization') {
      entry.amortizationCents += amount
    }

    monthMap.set(monthKey, entry)
  }

  // Convert to array and sort descending by month (most recent first)
  return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month))
}

/** 'YYYY-MM' do mês de `date`, em UTC como em `aggregateIncome`. */
function monthKeyOf(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Pure function: os `months` meses de calendário que terminam no mês de
 * `today`, do mais recente ao mais antigo. Mês sem renda vem com zero — o
 * gráfico mostra o buraco em vez de pular o mês, e a média conta o zero.
 */
export function lastIncomeMonths(events: IncomeEvent[], months: number = 12, today: Date = new Date()): IncomeMonth[] {
  const byMonth = new Map(aggregateIncome(events).map((m) => [m.month, m]))
  const result: IncomeMonth[] = []
  for (let i = 0; i < months; i++) {
    const month = monthKeyOf(today.getUTCFullYear(), today.getUTCMonth() - i)
    result.push(byMonth.get(month) ?? {
      month, totalCents: 0, dividendCents: 0, interestCents: 0, amortizationCents: 0, eventCount: 0,
    })
  }
  return result
}

/**
 * Pure function: média mensal da renda nos últimos `months` meses de
 * calendário (até o mês de `today`). Mês sem renda entra como zero; o divisor
 * só encurta quando o primeiro provento é mais novo que a janela — histórico
 * de 2 meses não é diluído por 12.
 *
 * @returns Estimated monthly income in integer cents
 */
export function estimateMonthlyIncome(events: IncomeEvent[], months: number = 12, today: Date = new Date()): number {
  const covered = lastIncomeMonths(events, months, today).slice(0, incomeAverageMonths(events, months, today))
  if (covered.length === 0) return 0
  const totalCents = covered.reduce((sum, m) => sum + m.totalCents, 0)
  return Math.round(totalCents / covered.length)
}

/** Quantos meses `estimateMonthlyIncome` usa como divisor — para o rótulo da média. */
export function incomeAverageMonths(events: IncomeEvent[], months: number = 12, today: Date = new Date()): number {
  const window = lastIncomeMonths(events, months, today)
  return window.map((m) => m.totalCents > 0).lastIndexOf(true) + 1
}
