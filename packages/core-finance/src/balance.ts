/**
 * Balance utility helpers for the Floow finance engine.
 * All monetary values are stored and processed as integer cents to avoid floating-point errors.
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Converts an integer cent value to a formatted BRL currency string.
 * Example: centsToCurrency(15075) => "R$ 150,75"
 */
export function centsToCurrency(cents: number): string {
  return BRL_FORMATTER.format(cents / 100)
}

/**
 * Converts a currency value (number or Brazilian string) to integer cents.
 * Handles both "150.75" (number) and "150,75" (Brazilian string) formats.
 * Example: currencyToCents("150,75") => 15075
 * Example: currencyToCents(150.75) => 15075
 */
export function currencyToCents(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100)
  }

  // Brazilian format: "1.234,56" — strip thousands separator (.), replace decimal comma with dot
  const normalized = value.replace(/\./g, '').replace(',', '.')
  return Math.round(parseFloat(normalized) * 100)
}

/**
 * Alias for centsToCurrency — formats cents as a BRL string with R$ symbol.
 * Example: formatBRL(15075) => "R$ 150,75"
 */
export function formatBRL(cents: number): string {
  return centsToCurrency(cents)
}
