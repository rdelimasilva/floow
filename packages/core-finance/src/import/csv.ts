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
 * Hash de 53 bits (cyrb53), síncrono e igual no navegador e no servidor — o
 * parse roda nos dois.
 */
function hash53(texto: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * Id determinístico da linha do CSV: hash da linha inteira mais a ocorrência
 * dela no arquivo. O mesmo arquivo sempre gera os mesmos ids (reimportar é
 * duplicata), e duas compras idênticas no mesmo dia entram as duas.
 *
 * Antes era o base64 do JSON cortado em 24 caracteres — só o começo da linha,
 * `{"Data":"05/09/202` — e todas as linhas do mesmo dia colidiam.
 */
function gerarIds(linhas: Record<string, string>[]): string[] {
  const vistas = new Map<string, number>()
  return linhas.map((linha) => {
    const hash = hash53(JSON.stringify(linha))
    const n = vistas.get(hash) ?? 0
    vistas.set(hash, n + 1)
    return n === 0 ? `csv-${hash}` : `csv-${hash}-${n}`
  })
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
/**
 * Cabeçalho do CSV, com o separador detectado pelo Papa — extrato de banco
 * brasileiro costuma vir com ponto e vírgula.
 */
export function lerCabecalhoCsv(content: string): string[] {
  const { meta } = Papa.parse<Record<string, string>>(content, { header: true, preview: 1 })
  return (meta.fields ?? []).map((f) => f.trim())
}

/**
 * Valor em texto para número. Com vírgula, é formato brasileiro: ponto é
 * milhar ("1.234,56"). Sem vírgula, o ponto é decimal ("5000.00").
 */
function lerValor(texto: string): number {
  const limpo = texto.replace(/R\$|\s/g, '')
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  return parseFloat(normalizado)
}

export function parseCSVFile(
  content: string,
  mapping: CsvColumnMapping,
): NormalizedTransaction[] {
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  const dateFormat = mapping.dateFormat ?? 'dd/MM/yyyy'

  const ids = gerarIds(data)

  return data.map((row, i) => {
    const dateStr = (row[mapping.dateColumn] ?? '').trim()
    const amountStr = (row[mapping.amountColumn] ?? '0').trim()
    const description = (row[mapping.descriptionColumn] ?? '').trim()

    const rawAmount = lerValor(amountStr)
    const amountCents = Math.round(rawAmount * 100)
    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense'

    return {
      externalId: ids[i],
      date: parseDate(dateStr, dateFormat),
      amountCents,
      description,
      type,
    }
  })
}
