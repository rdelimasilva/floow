/**
 * Generates all installment dates for a recurring transaction batch.
 * Pure function — no side effects, fully deterministic given inputs.
 */
import { advanceByFrequency, type RecurringFrequency } from './recurring'

const MAX_INSTALLMENTS = 120

interface GenerateDatesInput {
  startDate: Date
  frequency: RecurringFrequency
  endMode: 'count' | 'end_date' | 'indefinite'
  installmentCount?: number
  endDate?: Date
}

/**
 * Returns an array of dates for each installment.
 * - count: exactly N dates
 * - end_date: dates from startDate up to endDate (inclusive)
 * - indefinite: up to 60 months, capped at MAX_INSTALLMENTS
 */
export function generateInstallmentDates(input: GenerateDatesInput): Date[] {
  const dates: Date[] = []
  let current = new Date(input.startDate) // clone to avoid mutation

  if (input.endMode === 'count') {
    const count = Math.min(input.installmentCount ?? 1, MAX_INSTALLMENTS)
    for (let i = 0; i < count; i++) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  } else if (input.endMode === 'end_date') {
    const limit = input.endDate ?? input.startDate
    while (current <= limit && dates.length < MAX_INSTALLMENTS) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  } else {
    // indefinite: generate up to 60 months worth, capped at MAX_INSTALLMENTS
    const sixtyMonthsLater = new Date(input.startDate)
    sixtyMonthsLater.setMonth(sixtyMonthsLater.getMonth() + 60)
    while (current <= sixtyMonthsLater && dates.length < MAX_INSTALLMENTS) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  }

  return dates
}
