'use server'

import { revalidatePath } from 'next/cache'
import { getDb, accounts, transactions } from '@floow/db'
import { parseOFXFile, parseCSVFile } from '@floow/core-finance'
import type { CsvColumnMapping } from '@floow/core-finance'
import { eq, sql, and } from 'drizzle-orm'
import { getOrgId } from './queries'

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
 * Ownership: verifies the target account belongs to the user's org before
 * any write operation. Both the ownership check and writes are wrapped in a
 * transaction so a failure at any step rolls back all changes atomically.
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
  const db = getDb()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  // Parse file into normalized transactions (done outside transaction — pure computation)
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

  const { imported, skipped } = await db.transaction(async (tx) => {
    // Ownership check: verify the target account belongs to the org before any write
    const [accountRow] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
      .limit(1)

    if (!accountRow) {
      throw new Error(`Account ${accountId} not found or does not belong to this organization`)
    }

    // Insert with ON CONFLICT DO NOTHING for deduplication.
    // The UNIQUE INDEX uq_transactions_external_account(external_id, account_id)
    // from Plan 02-01 enables this. Returns only actually-inserted rows.
    const insertedRows = await tx
      .insert(transactions)
      .values(rows)
      .onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })
      .returning({ id: transactions.id, amountCents: transactions.amountCents })

    const importedCount = insertedRows.length
    const skippedCount = normalized.length - importedCount

    // Update account balance atomically using sum of inserted amounts.
    // Uses sql`balance_cents + ${delta}` to avoid read-modify-write race conditions.
    if (importedCount > 0) {
      const totalDelta = insertedRows.reduce((sum, row) => sum + row.amountCents, 0)

      if (totalDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${totalDelta}` })
          .where(eq(accounts.id, accountId))
      }
    }

    return { imported: importedCount, skipped: skippedCount }
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')

  return { imported, skipped }
}
