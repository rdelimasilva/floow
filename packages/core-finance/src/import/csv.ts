/**
 * CSV file parser for core-finance.
 * Handles Brazilian bank statement CSV exports with configurable column mapping.
 *
 * Brazilian banks have inconsistent CSV formats — column names, date formats,
 * and amount sign conventions vary. CsvColumnMapping lets users specify which
 * columns contain date, amount, and description data.
 */
import Papa from 'papaparse'
import type { NormalizedTransaction } from '../types'

/** Column mapping configuration for Brazilian bank CSV formats. */
export interface CsvColumnMapping {
  /** Column header name for the transaction date */
  dateColumn: string
  /** Column header name for the transaction amount */
  amountColumn: string
  /** Column header name for the transaction description */
  descriptionColumn: string
  /**
   * Date format used in the CSV file.
   * - 'dd/MM/yyyy': Brazilian format (Itaú, Bradesco, etc.)
   * - 'yyyy-MM-dd': ISO format (Nubank, some fintechs)
   * Defaults to 'dd/MM/yyyy' if not specified.
   */
  dateFormat?: 'dd/MM/yyyy' | 'yyyy-MM-dd'
}

/**
 * Parses a date string according to the specified format.
 * Returns a Date at noon UTC to avoid DST-related off-by-one day issues.
 */
function parseDate(dateStr: string, format: 'dd/MM/yyyy' | 'yyyy-MM-dd'): Date {
  if (format === 'dd/MM/yyyy') {
    // "15/01/2024" → [day, month, year]
    const [day, month, year] = dateStr.split('/')
    return new Date(`${year}-${month}-${day}T12:00:00Z`)
  } else {
    // "2024-01-15" → already ISO
    return new Date(`${dateStr}T12:00:00Z`)
  }
}

/**
 * Generates a deterministic externalId for CSV rows.
 * Uses base64 encoding of the JSON-serialized row content, prefixed with 'csv-'.
 * This ensures the same row always produces the same ID (idempotent deduplication).
 */
function generateExternalId(row: Record<string, string>): string {
  const hash = Buffer.from(JSON.stringify(row)).toString('base64').slice(0, 24)
  return `csv-${hash}`
}

/**
 * Parses CSV file content into normalized transactions using the provided column mapping.
 *
 * Handles:
 * - Brazilian date formats (dd/MM/yyyy) and ISO dates (yyyy-MM-dd)
 * - Negative amounts for expenses, positive for income
 * - Empty line skipping (via papaparse skipEmptyLines)
 * - Deterministic externalId for deduplication
 */
export function parseCSVFile(
  content: string,
  mapping: CsvColumnMapping,
): NormalizedTransaction[] {
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  const dateFormat = mapping.dateFormat ?? 'dd/MM/yyyy'

  return data.map((row) => {
    const dateStr = (row[mapping.dateColumn] ?? '').trim()
    const amountStr = (row[mapping.amountColumn] ?? '0').trim().replace(',', '.')
    const description = (row[mapping.descriptionColumn] ?? '').trim()

    const rawAmount = parseFloat(amountStr)
    const amountCents = Math.round(rawAmount * 100)
    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense'

    return {
      externalId: generateExternalId(row),
      date: parseDate(dateStr, dateFormat),
      amountCents,
      description,
      type,
    }
  })
}
