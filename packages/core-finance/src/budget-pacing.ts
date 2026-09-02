/**
 * Pacing de orçamento: cruza o orçado por categoria com o gasto diário efetivo.
 * Função pura — sem I/O, sem React. Ver docs/superpowers/specs/2026-09-02-budget-pacing-design.md
 */

/** Acima deste múltiplo do teto, a projeção classifica a categoria como risco. */
export const RISK_THRESHOLD = 1.1
/** Antes deste dia do mês, a projeção é ruído e a confiança é baixa. */
export const LOW_CONFIDENCE_DAY_CUTOFF = 7

export type AccountKind = 'checking' | 'savings' | 'brokerage' | 'credit_card' | 'cash'
export type PacingStatus = 'ok' | 'atencao' | 'risco' | 'estourado'
export type Confidence = 'low' | 'normal' | 'final'

export const ACCOUNT_KINDS: AccountKind[] = [
  'checking',
  'savings',
  'brokerage',
  'credit_card',
  'cash',
]

export interface DailySpendRow {
  /** YYYY-MM-DD */
  date: string
  accountType: AccountKind
  categoryId: string | null
  /** Positivo, já normalizado pela query. */
  cents: number
}

export interface BudgetCap {
  categoryId: string
  plannedCents: number
}

export interface BudgetPacingInput {
  daily: DailySpendRow[]
  budgets: BudgetCap[]
  /** Primeiro dia do mês analisado. */
  monthStart: Date
  today: Date
}

export interface BudgetPacingResult {
  series: {
    date: string
    /** Acumulados desde o dia 1 do mês. */
    byAccountTypeCum: Record<AccountKind, number>
    budgetedCum: number
    unbudgetedCum: number
  }[]
  total: {
    plannedCents: number
    spentCents: number
    unbudgetedCents: number
    projectedCents: number
    confidence: Confidence
    daysElapsed: number
    daysInMonth: number
  }
  byCategory: {
    categoryId: string
    plannedCents: number
    spentCents: number
    projectedCents: number
    status: PacingStatus
  }[]
}

/** YYYY-MM-DD a partir de um Date, sempre em UTC. */
export function toISODate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function emptyByAccountType(): Record<AccountKind, number> {
  return { checking: 0, savings: 0, brokerage: 0, credit_card: 0, cash: 0 }
}

export function computeBudgetPacing(input: BudgetPacingInput): BudgetPacingResult {
  const { monthStart } = input
  const year = monthStart.getUTCFullYear()
  const month = monthStart.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  // Índice: YYYY-MM-DD -> posição em series
  const indexByDate = new Map<string, number>()
  const series: BudgetPacingResult['series'] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toISODate(new Date(Date.UTC(year, month, day)))
    indexByDate.set(date, series.length)
    series.push({
      date,
      byAccountTypeCum: emptyByAccountType(),
      budgetedCum: 0,
      unbudgetedCum: 0,
    })
  }

  // Teto zero ou ausente = categoria não orçada (spec D5).
  const capByCategory = new Map<string, number>()
  for (const b of input.budgets) {
    if (b.plannedCents > 0) capByCategory.set(b.categoryId, b.plannedCents)
  }

  // Soma cada linha no seu dia; linhas fora do mês são ignoradas.
  for (const row of input.daily) {
    const idx = indexByDate.get(row.date)
    if (idx === undefined) continue
    series[idx].byAccountTypeCum[row.accountType] += row.cents

    const isBudgeted = row.categoryId !== null && capByCategory.has(row.categoryId)
    if (isBudgeted) series[idx].budgetedCum += row.cents
    else series[idx].unbudgetedCum += row.cents
  }

  // Converte os totais diários em acumulados.
  for (let i = 1; i < series.length; i++) {
    for (const kind of ACCOUNT_KINDS) {
      series[i].byAccountTypeCum[kind] += series[i - 1].byAccountTypeCum[kind]
    }
    series[i].budgetedCum += series[i - 1].budgetedCum
    series[i].unbudgetedCum += series[i - 1].unbudgetedCum
  }

  const last = series[series.length - 1]
  let plannedCents = 0
  for (const planned of capByCategory.values()) plannedCents += planned

  return {
    series,
    total: {
      plannedCents,
      spentCents: last.budgetedCum,
      unbudgetedCents: last.unbudgetedCum,
      projectedCents: 0,
      confidence: 'low',
      daysElapsed: 0,
      daysInMonth,
    },
    byCategory: [],
  }
}
