import { describe, it, expect } from 'vitest'
import { advanceByFrequency, getOverdueDates, RecurringFrequency } from '../recurring'

describe('advanceByFrequency', () => {
  it('daily: adds 1 day', () => {
    const result = advanceByFrequency(new Date('2026-01-15'), 'daily')
    expect(result.toISOString().startsWith('2026-01-16')).toBe(true)
  })

  it('weekly: adds 7 days', () => {
    const result = advanceByFrequency(new Date('2026-01-01'), 'weekly')
    expect(result.toISOString().startsWith('2026-01-08')).toBe(true)
  })

  it('biweekly: adds 14 days', () => {
    const result = advanceByFrequency(new Date('2026-01-01'), 'biweekly')
    expect(result.toISOString().startsWith('2026-01-15')).toBe(true)
  })

  it('monthly: adds 1 month (normal case)', () => {
    const result = advanceByFrequency(new Date('2026-01-15'), 'monthly')
    expect(result.toISOString().startsWith('2026-02-15')).toBe(true)
  })

  it('monthly: clamps Jan 31 to Feb 28 (non-leap year)', () => {
    const result = advanceByFrequency(new Date('2026-01-31'), 'monthly')
    expect(result.toISOString().startsWith('2026-02-28')).toBe(true)
  })

  it('quarterly: adds 3 months', () => {
    const result = advanceByFrequency(new Date('2026-01-01'), 'quarterly')
    expect(result.toISOString().startsWith('2026-04-01')).toBe(true)
  })

  it('yearly: adds 1 year', () => {
    const result = advanceByFrequency(new Date('2026-03-18'), 'yearly')
    expect(result.toISOString().startsWith('2027-03-18')).toBe(true)
  })

  it('monthly month-end chain: Jan 31 -> Feb 28 -> Mar 28 (clamp sticks, does not revert to 31)', () => {
    const jan31 = new Date('2026-01-31')
    const feb = advanceByFrequency(jan31, 'monthly')
    expect(feb.toISOString().startsWith('2026-02-28')).toBe(true)

    const mar = advanceByFrequency(feb, 'monthly')
    // Feb 28 + 1 month = Mar 28 (not Mar 31)
    expect(mar.toISOString().startsWith('2026-03-28')).toBe(true)
  })

  it('monthly: Jan 31 -> Feb 29 on leap year (2028)', () => {
    const result = advanceByFrequency(new Date('2028-01-31'), 'monthly')
    // 2028 is a leap year
    expect(result.toISOString().startsWith('2028-02-29')).toBe(true)
  })

  it('yearly: spans leap year without clamping', () => {
    const result = advanceByFrequency(new Date('2027-03-01'), 'yearly')
    expect(result.toISOString().startsWith('2028-03-01')).toBe(true)
  })
})

describe('getOverdueDates', () => {
  it('returns empty array when nextDueDate is after referenceDate', () => {
    const result = getOverdueDates(
      new Date('2026-04-01'),
      'monthly',
      new Date('2026-03-18')
    )
    expect(result).toHaveLength(0)
  })

  it('returns single date when nextDueDate equals referenceDate', () => {
    const result = getOverdueDates(
      new Date('2026-03-18'),
      'monthly',
      new Date('2026-03-18')
    )
    expect(result).toHaveLength(1)
    expect(result[0].toISOString().startsWith('2026-03-18')).toBe(true)
  })

  it('returns multiple dates for overdue monthly template (Jan 1 with Mar 18 ref)', () => {
    const result = getOverdueDates(
      new Date('2026-01-01'),
      'monthly',
      new Date('2026-03-18')
    )
    // Jan 1, Feb 1, Mar 1 are all <= Mar 18; Apr 1 > Mar 18
    expect(result).toHaveLength(3)
    expect(result[0].toISOString().startsWith('2026-01-01')).toBe(true)
    expect(result[1].toISOString().startsWith('2026-02-01')).toBe(true)
    expect(result[2].toISOString().startsWith('2026-03-01')).toBe(true)
  })

  it('returns correct dates for daily frequency across a week', () => {
    const result = getOverdueDates(
      new Date('2026-03-01'),
      'daily',
      new Date('2026-03-03')
    )
    // Mar 1, Mar 2, Mar 3
    expect(result).toHaveLength(3)
    expect(result[0].toISOString().startsWith('2026-03-01')).toBe(true)
    expect(result[1].toISOString().startsWith('2026-03-02')).toBe(true)
    expect(result[2].toISOString().startsWith('2026-03-03')).toBe(true)
  })

  it('returns correct dates for yearly frequency spanning multiple years', () => {
    const result = getOverdueDates(
      new Date('2024-01-01'),
      'yearly',
      new Date('2026-06-01')
    )
    // Jan 1 2024, Jan 1 2025, Jan 1 2026 are all <= Jun 1 2026; Jan 1 2027 is not
    expect(result).toHaveLength(3)
    expect(result[0].toISOString().startsWith('2024-01-01')).toBe(true)
    expect(result[1].toISOString().startsWith('2025-01-01')).toBe(true)
    expect(result[2].toISOString().startsWith('2026-01-01')).toBe(true)
  })

  it('returns correct dates for weekly frequency', () => {
    const result = getOverdueDates(
      new Date('2026-03-01'),
      'weekly',
      new Date('2026-03-15')
    )
    // Mar 1, Mar 8, Mar 15
    expect(result).toHaveLength(3)
    expect(result[0].toISOString().startsWith('2026-03-01')).toBe(true)
    expect(result[1].toISOString().startsWith('2026-03-08')).toBe(true)
    expect(result[2].toISOString().startsWith('2026-03-15')).toBe(true)
  })

  it('returns correct dates for quarterly frequency', () => {
    const result = getOverdueDates(
      new Date('2025-01-01'),
      'quarterly',
      new Date('2026-01-01')
    )
    // Jan 2025, Apr 2025, Jul 2025, Oct 2025, Jan 2026
    expect(result).toHaveLength(5)
    expect(result[0].toISOString().startsWith('2025-01-01')).toBe(true)
    expect(result[4].toISOString().startsWith('2026-01-01')).toBe(true)
  })
})
