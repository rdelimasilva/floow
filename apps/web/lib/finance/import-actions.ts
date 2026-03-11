'use server'

import { revalidatePath } from 'next/cache'
import { createDb, accounts, transactions } from '@floow/db'
import { parseOFXFile, parseCSVFile } from '@floow/core-finance'
import type { CsvColumnMapping } from '@floow/core-finance'
import { eq, sql } from 'drizzle-orm'
import { getOrgId } from './queries'

const DATABASE_URL = process.env.DATABASE_URL ?? ''

/**
 * Result returned after an import operation.
 */
export interface ImportResult {
  imported: number
  skipped: number
}

/**
 * Server action: import transactions from an OFX or CSV file.
 *
 * Deduplication: uses onConflictDoNothing on the UNIQUE INDEX
 * uq_transactions_external_account(external_id, account_id) created in
 * Plan 02-01 migration. Without that unique constraint, this would throw.
 *
 * Balance update: after insert, sums the amountCents of all actually-inserted
 * rows (returned via .returning()) and applies an atomic SQL increment.
 *
 * FormData fields:
 * - file: File (OFX or CSV)
 * - accountId: string
 * - dateColumn: string (CSV only)
 * - amountColumn: string (CSV only)
 * - descriptionColumn: string (CSV only)
 * - dateFormat: 'dd/MM/yyyy' | 'yyyy-MM-dd' (CSV only, optional)
 */
export async function importTransactions(formData: FormData): Promise<ImportResult> {
  const orgId = await getOrgId()
  const db = createDb(DATABASE_URL)

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  // Parse file into normalized transactions
  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, {
        dateColumn: (formData.get('dateColumn') as string) ?? 'Data',
        amountColumn: (formData.get('amountColumn') as string) ?? 'Valor',
        descriptionColumn: (formData.get('descriptionColumn') as string) ?? 'Descricao',
        dateFormat: ((formData.get('dateFormat') as string) ?? 'dd/MM/yyyy') as CsvColumnMapping['dateFormat'],
      })

  if (normalized.length === 0) {
    return { imported: 0, skipped: 0 }
  }

  const importedAt = new Date()

  // Build row objects for all normalized transactions
  const rows = normalized.map((tx) => ({
    orgId,
    accountId,
    type: tx.type,
    amountCents: tx.amountCents,
    description: tx.description,
    date: tx.date,
    externalId: tx.externalId,
    importedAt,
  }))

  // Insert with ON CONFLICT DO NOTHING for deduplication.
  // The UNIQUE INDEX uq_transactions_external_account(external_id, account_id)
  // from Plan 02-01 enables this. Returns only actually-inserted rows.
  const insertedRows = await db
    .insert(transactions)
    .values(rows)
    .onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })
    .returning({ id: transactions.id, amountCents: transactions.amountCents })

  const imported = insertedRows.length
  const skipped = normalized.length - imported

  // Update account balance atomically using sum of inserted amounts.
  // Uses sql`balance_cents + ${delta}` to avoid read-modify-write race conditions.
  if (imported > 0) {
    const totalDelta = insertedRows.reduce((sum, row) => sum + row.amountCents, 0)

    if (totalDelta !== 0) {
      await db
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${totalDelta}` })
        .where(eq(accounts.id, accountId))
    }
  }

  revalidatePath('/transactions')
  revalidatePath('/accounts')

  return { imported, skipped }
}
