/**
 * OFX file parser for core-finance.
 * Handles SGML-based OFX bank statement exports (Brazilian bank format).
 *
 * CRITICAL: OFX dates are YYYYMMDDHHMMSS.SSS[±hh:TZ] — NOT ISO 8601.
 * Do NOT pass raw OFX dates to `new Date()`. Use parseOFXDate() instead.
 */
import { parse as parseOFX } from 'ofx-js'
import type { NormalizedTransaction } from '../types'

/**
 * Parses an OFX date string into a JavaScript Date.
 *
 * OFX date formats:
 * - Long:  "20240115120000.000[-3:BRT]"  (YYYYMMDDHHMMSS.SSS[TZ])
 * - Short: "20240115"                     (YYYYMMDD)
 *
 * We only use the YYYYMMDD prefix — timezone handling is intentionally omitted
 * to avoid user confusion (bank dates are dates, not timestamps).
 */
export function parseOFXDate(ofxDate: string): Date {
  const year = ofxDate.slice(0, 4)
  const month = ofxDate.slice(4, 6)
  const day = ofxDate.slice(6, 8)
  // Use noon UTC to avoid DST-related off-by-one day errors
  return new Date(`${year}-${month}-${day}T12:00:00Z`)
}

/**
 * Parses OFX file content into normalized transactions.
 *
 * Navigates: OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN
 * Uses FITID as externalId for deduplication.
 * Amount sign determines type: positive = income, negative = expense.
 */
export async function parseOFXFile(content: string): Promise<NormalizedTransaction[]> {
  const ofxData = await parseOFX(content)
  const stmtrs = ofxData?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS

  if (!stmtrs) {
    throw new Error('Invalid OFX file: no STMTRS block found. Ensure the file is a valid OFX bank statement.')
  }

  const txns = stmtrs.BANKTRANLIST?.STMTTRN
  if (!txns) {
    // No transactions in the file — return empty array (valid state)
    return []
  }

  const list = Array.isArray(txns) ? txns : [txns]

  return list.map((t) => {
    const rawAmount = parseFloat(t.TRNAMT)
    const amountCents = Math.round(rawAmount * 100)
    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense'

    return {
      externalId: String(t.FITID),
      date: parseOFXDate(String(t.DTPOSTED)),
      amountCents,
      description: String(t.MEMO || t.NAME || '').trim(),
      type,
    }
  })
}
