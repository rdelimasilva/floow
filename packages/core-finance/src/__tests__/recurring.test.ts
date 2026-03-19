/**
 * recurring.test.ts
 *
 * NOTE ON DATE CONSTRUCTION:
 * Tests use `new Date(YYYY, M, D)` (local date constructor) rather than
 * `new Date('YYYY-MM-DD')` (ISO string, which creates UTC midnight).
 *
 * In UTC-3 (Brazil timezone), `new Date('2026-01-31')` resolves to
 * 2026-01-30T21:00:00 local time. When date-fns advances by 1 month in
 * local time, it adds to Jan 30 (not Jan 31), producing incorrect results.
 *
 * Using `new Date(2026, 0, 31)` creates a local midnight date, so date-fns
 * advances correctly from Jan 31 -> Feb 28.
 *
 * Assertions use `.toLocaleDateString('en-CA')` which returns 'YYYY-MM-DD'
 * in local time, avoiding toISOString UTC conversion issues.
 */
import { describe, it, expect } from 'vitest'
import { advanceByFrequency, getOverdueDates, RecurringFrequency } from '../recurring'

/** Helper to format a Date as 'YYYY-MM-DD' in local time. */
function localDate(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

describe('advanceByFrequency', () => {
  it('daily: adds 1 day', () => {
    const result = advanceByFrequency(new Date(2026, 0, 15), 'daily')
    expect(localDate(result)).toBe('2026-01-16')
  })

  it('weekly: adds 7 days', () => {
    const result = advanceByFrequency(new Date(2026, 0, 1), 'weekly')
    expect(localDate(result)).toBe('2026-01-08')
  })

  it('biweekly: adds 14 days', () => {
    const result = advanceByFrequency(new Date(2026, 0, 1), 'biweekly')
    expect(localDate(result)).toBe('2026-01-15')
  })

  it('monthly: adds 1 month (normal case)', () => {
    const result = advanceByFrequency(new Date(2026, 0, 15), 'monthly')
    expect(localDate(result)).toBe('2026-02-15')
  })

  it('monthly: clamps Jan 31 to Feb 28 (non-leap year)', () => {
    const result = advanceByFrequency(new Date(2026, 0, 31), 'monthly')
    expect(localDate(result)).toBe('2026-02-28')
  })

  it('quarterly: adds 3 months', () => {
    const result = advanceByFrequency(new Date(2026, 0, 1), 'quarterly')
    expect(localDate(result)).toBe('2026-04-01')
  })

  it('yearly: adds 1 year', () => {
    const result = advanceByFrequency(new Date(2026, 2, 18), 'yearly')
    expect(localDate(result)).toBe('2027-03-18')
  })

  it('monthly month-end chain: Jan 31 -> Feb 28 -> Mar 28 (clamp sticks, does not revert to 31)', () => {
    const jan31 = new Date(2026, 0, 31)
    const feb = advanceByFrequency(jan31, 'monthly')
    expect(localDate(feb)).toBe('2026-02-28')

    const mar = advanceByFrequency(feb, 'monthly')
    // Feb 28 + 1 month = Mar 28 (not Mar 31)
    expect(localDate(mar)).toBe('2026-03-28')
  })

  it('monthly: Jan 31 -> Feb 29 on leap year (2028)', () => {
    const result = advanceByFrequency(new Date(2028, 0, 31), 'monthly')
    // 2028 is a leap year
    expect(localDate(result)).toBe('2028-02-29')
  })

  it('yearly: spans leap year without clamping', () => {
    const result = advanceByFrequency(new Date(2027, 2, 1), 'yearly')
    expect(localDate(result)).toBe('2028-03-01')
  })
})

describe('getOverdueDates', () => {
  it('returns empty array when nextDueDate is after referenceDate', () => {
    const result = getOverdueDates(
      new Date(2026, 3, 1),   // Apr 1
      'monthly',
      new Date(2026, 2, 18)  // Mar 18
    )
    expect(result).toHaveLength(0)
  })

  it('returns single date when nextDueDate equals referenceDate', () => {
    const result = getOverdueDates(
      new Date(2026, 2, 18),  // Mar 18
      'monthly',
      new Date(2026, 2, 18)   // Mar 18
    )
    expect(result).toHaveLength(1)
    expect(localDate(result[0])).toBe('2026-03-18')
  })

  it('returns multiple dates for overdue monthly template (Jan 1 with Mar 18 ref)', () => {
    const result = getOverdueDates(
      new Date(2026, 0, 1),   // Jan 1
      'monthly',
      new Date(2026, 2, 18)  // Mar 18
    )
    // Jan 1, Feb 1, Mar 1 are all <= Mar 18; Apr 1 > Mar 18
    expect(result).toHaveLength(3)
    expect(localDate(result[0])).toBe('2026-01-01')
    expect(localDate(result[1])).toBe('2026-02-01')
    expect(localDate(result[2])).toBe('2026-03-01')
  })

  it('returns correct dates for daily frequency across a few days', () => {
    const result = getOverdueDates(
      new Date(2026, 2, 1),   // Mar 1
      'daily',
      new Date(2026, 2, 3)    // Mar 3
    )
    // Mar 1, Mar 2, Mar 3
    expect(result).toHaveLength(3)
    expect(localDate(result[0])).toBe('2026-03-01')
    expect(localDate(result[1])).toBe('2026-03-02')
    expect(localDate(result[2])).toBe('2026-03-03')
  })

  it('returns correct dates for yearly frequency spanning multiple years', () => {
    const result = getOverdueDates(
      new Date(2024, 0, 1),  // Jan 1 2024
      'yearly',
      new Date(2026, 5, 1)   // Jun 1 2026
    )
    // Jan 1 2024, Jan 1 2025, Jan 1 2026 are all <= Jun 1 2026; Jan 1 2027 is not
    expect(result).toHaveLength(3)
    expect(localDate(result[0])).toBe('2024-01-01')
    expect(localDate(result[1])).toBe('2025-01-01')
    expect(localDate(result[2])).toBe('2026-01-01')
  })

  it('returns correct dates for weekly frequency', () => {
    const result = getOverdueDates(
      new Date(2026, 2, 1),   // Mar 1
      'weekly',
      new Date(2026, 2, 15)   // Mar 15
    )
    // Mar 1, Mar 8, Mar 15
    expect(result).toHaveLength(3)
    expect(localDate(result[0])).toBe('2026-03-01')
    expect(localDate(result[1])).toBe('2026-03-08')
    expect(localDate(result[2])).toBe('2026-03-15')
  })

  it('returns correct dates for quarterly frequency', () => {
    const result = getOverdueDates(
      new Date(2025, 0, 1),   // Jan 1 2025
      'quarterly',
      new Date(2026, 0, 1)    // Jan 1 2026 (inclusive)
    )
    // Jan 2025, Apr 2025, Jul 2025, Oct 2025, Jan 2026
    expect(result).toHaveLength(5)
    expect(localDate(result[0])).toBe('2025-01-01')
    expect(localDate(result[4])).toBe('2026-01-01')
  })
})
