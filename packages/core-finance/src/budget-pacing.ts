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

  const series: BudgetPacingResult['series'] = []
  for (let day = 1; day <= daysInMonth; day++) {
    series.push({
      date: toISODate(new Date(Date.UTC(year, month, day))),
      byAccountTypeCum: emptyByAccountType(),
      budgetedCum: 0,
      unbudgetedCum: 0,
    })
  }

  return {
    series,
    total: {
      plannedCents: 0,
      spentCents: 0,
      unbudgetedCents: 0,
      projectedCents: 0,
      confidence: 'low',
      daysElapsed: 0,
      daysInMonth,
    },
    byCategory: [],
  }
}
