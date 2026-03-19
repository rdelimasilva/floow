/**
 * Recurring transaction logic — pure functions for date advancement and overdue detection.
 *
 * All functions are deterministic: no calls to `new Date()` inside.
 * All dates are passed as parameters to make functions fully testable.
 *
 * Month-end clamp behavior (via date-fns addMonths / addQuarters):
 * - Jan 31 + 1 month = Feb 28 (non-leap) or Feb 29 (leap year)
 * - Feb 28 + 1 month = Mar 28 (clamp sticks — does not revert to 31)
 * This is the standard date-fns behavior and is the desired v1.1 behavior.
 */

import { addDays, addWeeks, addMonths, addQuarters, addYears } from 'date-fns'

/** Supported recurring frequency values. */
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

/**
 * Advances a date by one period of the given frequency.
 *
 * Uses date-fns for correct month-end clamping:
 * - Jan 31 + monthly = Feb 28 (non-leap year) or Feb 29 (leap year)
 * - The clamped date sticks: Feb 28 + monthly = Mar 28
 *
 * @param date - The base date to advance from (not mutated).
 * @param frequency - The recurrence frequency.
 * @returns A new Date one period ahead.
 */
export function advanceByFrequency(date: Date, frequency: RecurringFrequency): Date {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1)
    case 'weekly':
      return addWeeks(date, 1)
    case 'biweekly':
      return addWeeks(date, 2)
    case 'monthly':
      return addMonths(date, 1)
    case 'quarterly':
      return addQuarters(date, 1)
    case 'yearly':
      return addYears(date, 1)
  }
}

/**
 * Returns all due dates from `nextDueDate` up to and including `referenceDate`.
 *
 * Used to determine which recurring transactions need to be generated. The
 * caller should pass `new Date()` (or a server-side `now`) as `referenceDate`.
 *
 * @param nextDueDate - The next scheduled due date for the recurring template.
 * @param frequency - The recurrence frequency.
 * @param referenceDate - The upper bound (inclusive). Typically "today".
 * @returns Array of due dates <= referenceDate. Empty if nextDueDate > referenceDate.
 *
 * @example
 * // Monthly template due Jan 1, checked on Mar 18
 * getOverdueDates(new Date('2026-01-01'), 'monthly', new Date('2026-03-18'))
 * // => [Jan 1, Feb 1, Mar 1]
 */
export function getOverdueDates(
  nextDueDate: Date,
  frequency: RecurringFrequency,
  referenceDate: Date
): Date[] {
  const due: Date[] = []
  let current = nextDueDate

  while (current <= referenceDate) {
    due.push(current)
    current = advanceByFrequency(current, frequency)
  }

  return due
}
