/**
 * Cash flow aggregation logic for core-finance.
 * Groups transactions by month and separates income/expense totals.
 * Used by the financial dashboard (FIN-04) and cash flow chart.
 */
import type { CashFlowMonth } from './types'

/** Minimal transaction shape required for cash flow aggregation */
interface TransactionForCashFlow {
  date: Date
  amountCents: number
  type: string
}

/**
 * Aggregates transactions into monthly cash flow data.
 *
 * Returns an array of CashFlowMonth objects sorted descending by month
 * (most recent first). Each month contains:
 * - income: sum of positive amountCents where type='income'
 * - expense: sum of negative amountCents where type='expense'
 * - net: income + expense (net is positive when income > abs(expense))
 *
 * @param transactions - Array of transaction objects with date, amountCents, type
 * @returns CashFlowMonth[] sorted descending by month (YYYY-MM format)
 */
export function aggregateCashFlow(
  transactions: TransactionForCashFlow[],
): CashFlowMonth[] {
  if (transactions.length === 0) return []

  const monthMap = new Map<string, { income: number; expense: number }>()

  for (const tx of transactions) {
    // Format as YYYY-MM using UTC to match the date stored at noon UTC
    const month = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, '0')}`

    const existing = monthMap.get(month) ?? { income: 0, expense: 0 }

    if (tx.type === 'income') {
      existing.income += tx.amountCents
    } else if (tx.type === 'expense') {
      existing.expense += tx.amountCents
    }

    monthMap.set(month, existing)
  }

  const result: CashFlowMonth[] = Array.from(monthMap.entries()).map(
    ([month, { income, expense }]) => ({
      month,
      income,
      expense,
      net: income + expense,
    }),
  )

  // Sort descending (most recent month first)
  result.sort((a, b) => b.month.localeCompare(a.month))

  return result
}
