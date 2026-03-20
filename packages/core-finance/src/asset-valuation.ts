/**
 * Estimates the current value of a fixed asset based on its annual rate.
 *
 * Formula: baseValue × (1 + annualRate) ^ (daysElapsed / 365)
 *
 * @param baseValueCents - Last known value in cents (current_value_cents)
 * @param baseDate - Date of last known value (current_value_date)
 * @param annualRate - Annual rate as decimal (0.03 = +3%, -0.10 = -10%)
 * @param referenceDate - Date to estimate for (defaults to today)
 * @returns Estimated value in cents, rounded to integer
 */
export function estimateAssetValue(
  baseValueCents: number,
  baseDate: Date,
  annualRate: number,
  referenceDate: Date = new Date(),
): number {
  const msPerDay = 86_400_000
  const daysElapsed = (referenceDate.getTime() - baseDate.getTime()) / msPerDay

  if (daysElapsed <= 0) return baseValueCents

  const yearsElapsed = daysElapsed / 365
  const factor = Math.pow(1 + annualRate, yearsElapsed)

  return Math.round(baseValueCents * factor)
}
