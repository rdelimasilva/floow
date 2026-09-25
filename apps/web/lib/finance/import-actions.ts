'use server'

import { revalidatePath } from 'next/cache'
import { getDb, accounts, transactions } from '@floow/db'
import { parseOFXFile, parseCSVFile, matchCategory } from '@floow/core-finance'
import type { CsvColumnMapping } from '@floow/core-finance'
import { eq, sql, and, gte, lte } from 'drizzle-orm'
import { getOrgId, getCategoryRules } from './queries'
import { inserirTransferenciaImportada } from './import-transfer'
import { criarPropostasDeConciliacao } from './forecast-match-db'
import {
  accountsTag,
  recentTransactionsTag,
  transactionsTag,
  invalidateTag,
} from '@/lib/cache-tags'

type Db = ReturnType<typeof getDb>

/**
 * Result returned after an import operation.
 */
export interface ImportResult {
  imported: number
  skipped: number
  /** `importedAt` do lote — a chave para desfazer a importação. */
  lote?: string
}

/**
 * Match status for a parsed transaction during import preview.
 */
export type MatchStatus = 'new' | 'duplicate' | 'possible_match'

/**
 * A single item in the import preview — the parsed transaction plus its match status.
 */
export interface PreviewItem {
  index: number
  parsed: {
    date: string
    description: string
    amountCents: number
    type: 'income' | 'expense'
    externalId: string | null
  }
  status: MatchStatus
  suggestedCategoryId: string | null
  isAutoCategorized: boolean
  matchedTransaction?: {
    id: string
    date: string
    description: string
    amountCents: number
  }
}

/**
 * Per-transaction override applied during import review step.
 */
export interface TransactionOverride {
  index: number
  categoryId: string | null
  type: 'income' | 'expense' | 'transfer'
  transferToAccountId?: string
}

/**
 * Server action: parse an import file and compare against existing transactions.
 * Returns categorized preview items WITHOUT inserting anything.
 *
 * Matching logic:
 * - DUPLICATE: same externalId + same account (exact match via unique index)
 * - POSSIBLE_MATCH: same amountCents + date within ±1 day + same account
 * - NEW: no match found
 */
export async function previewImport(formData: FormData): Promise<PreviewItem[]> {
  const orgId = await getOrgId()
  const db = getDb()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, {
        dateColumn: (formData.get('dateColumn') as string) ?? 'Data',
        amountColumn: (formData.get('amountColumn') as string) ?? 'Valor',
        descriptionColumn: (formData.get('descriptionColumn') as string) ?? 'Descricao',
        dateFormat: ((formData.get('dateFormat') as string) ?? 'dd/MM/yyyy') as CsvColumnMapping['dateFormat'],
      })

  if (normalized.length === 0) return []

  // Find date range of parsed transactions (±1 day for fuzzy matching)
  const dates = normalized.map((tx) => tx.date.getTime())
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  minDate.setDate(minDate.getDate() - 1)
  maxDate.setDate(maxDate.getDate() + 1)

  // Fetch existing transactions in the date range for this account
  const existing = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      externalId: transactions.externalId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.accountId, accountId),
        gte(transactions.date, minDate),
        lte(transactions.date, maxDate),
      )
    )

  // Build lookup structures
  const externalIdSet = new Set(existing.filter((t) => t.externalId).map((t) => t.externalId!))

  // Auto-categorize for suggestions
  const allRules = await getCategoryRules(orgId)
  const enabledRules = allRules.filter((r) => r.isEnabled)

  const items: PreviewItem[] = normalized.map((tx, index) => {
    const parsed = {
      date: tx.date.toISOString(),
      description: tx.description,
      amountCents: tx.amountCents,
      type: tx.type as 'income' | 'expense',
      externalId: tx.externalId,
    }

    const suggestedCategoryId =
      tx.description && enabledRules.length > 0
        ? matchCategory(tx.description, enabledRules)
        : null

    // Check exact duplicate by externalId
    if (tx.externalId && externalIdSet.has(tx.externalId)) {
      const matched = existing.find((e) => e.externalId === tx.externalId)
      return {
        index,
        parsed,
        status: 'duplicate' as MatchStatus,
        suggestedCategoryId,
        isAutoCategorized: suggestedCategoryId !== null,
        matchedTransaction: matched
          ? { id: matched.id, date: matched.date.toISOString(), description: matched.description, amountCents: matched.amountCents }
          : undefined,
      }
    }

    // Check possible match by amount + date ±1 day
    const txTime = tx.date.getTime()
    const oneDay = 86400000
    const possibleMatch = existing.find(
      (e) =>
        e.amountCents === tx.amountCents &&
        Math.abs(e.date.getTime() - txTime) <= oneDay
    )

    if (possibleMatch) {
      return {
        index,
        parsed,
        status: 'possible_match' as MatchStatus,
        suggestedCategoryId,
        isAutoCategorized: suggestedCategoryId !== null,
        matchedTransaction: {
          id: possibleMatch.id,
          date: possibleMatch.date.toISOString(),
          description: possibleMatch.description,
          amountCents: possibleMatch.amountCents,
        },
      }
    }

    return { index, parsed, status: 'new' as MatchStatus, suggestedCategoryId, isAutoCategorized: suggestedCategoryId !== null }
  })

  return items
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

  // Auto-categorize: fetch enabled rules once before the transaction block
  const allRules = await getCategoryRules(orgId)
  const enabledRules = allRules.filter((r) => r.isEnabled)

  // Build row objects for all normalized transactions, applying auto-categorization
  const rows = normalized.map((tx) => {
    const autoCategoryId =
      tx.description && enabledRules.length > 0
        ? matchCategory(tx.description, enabledRules)
        : null
    return {
      orgId,
      accountId,
      type: tx.type,
      amountCents: tx.amountCents,
      description: tx.description,
      date: tx.date,
      externalId: tx.externalId,
      importedAt,
      categoryId: autoCategoryId,
      isAutoCategorized: autoCategoryId !== null,
    }
  })

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
      .onConflictDoNothing()
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
  revalidatePath('/accounts', 'layout')
  invalidateTag(transactionsTag(orgId))
  invalidateTag(recentTransactionsTag(orgId, 6))
  invalidateTag(recentTransactionsTag(orgId, 24))
  invalidateTag(accountsTag(orgId))

  return { imported, skipped }
}

/**
 * Server action: import only the selected transactions from a previously previewed file.
 * Re-parses the file (stateless), filters to selected indices, and inserts with
 * ON CONFLICT DO NOTHING as a safety net.
 */
export async function importSelectedTransactions(formData: FormData): Promise<ImportResult> {
  const orgId = await getOrgId()
  const db = getDb()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const accountId = formData.get('accountId') as string | null
  if (!accountId) throw new Error('No accountId provided')

  const selectedIndicesJson = formData.get('selectedIndices') as string | null
  if (!selectedIndicesJson) throw new Error('No selected indices provided')
  const selectedIndices = new Set<number>(JSON.parse(selectedIndicesJson))

  const overridesJson = formData.get('overrides') as string | null
  const overrides: TransactionOverride[] = overridesJson ? JSON.parse(overridesJson) : []
  const overrideMap = new Map(overrides.map((o) => [o.index, o]))

  if (selectedIndices.size === 0) return { imported: 0, skipped: 0 }

  const content = await file.text()
  const isOFX = file.name.toLowerCase().endsWith('.ofx')

  const normalized = isOFX
    ? await parseOFXFile(content)
    : parseCSVFile(content, {
        dateColumn: (formData.get('dateColumn') as string) ?? 'Data',
        amountColumn: (formData.get('amountColumn') as string) ?? 'Valor',
        descriptionColumn: (formData.get('descriptionColumn') as string) ?? 'Descricao',
        dateFormat: ((formData.get('dateFormat') as string) ?? 'dd/MM/yyyy') as CsvColumnMapping['dateFormat'],
      })

  // Filter to only selected indices, preserving original index for override lookup
  const selectedWithIndex = normalized
    .map((tx, idx) => ({ tx, idx }))
    .filter(({ idx }) => selectedIndices.has(idx))
  if (selectedWithIndex.length === 0) return { imported: 0, skipped: 0 }

  // Separate regular transactions from transfers
  const regularItems: typeof selectedWithIndex = []
  const transferItems: { tx: (typeof normalized)[number]; idx: number; destAccountId: string }[] = []

  for (const item of selectedWithIndex) {
    const override = overrideMap.get(item.idx)
    if (override?.type === 'transfer' && override.transferToAccountId) {
      transferItems.push({ ...item, destAccountId: override.transferToAccountId })
    } else {
      regularItems.push(item)
    }
  }

  const importedAt = new Date()

  // Auto-categorize: fetch enabled rules once before the transaction block
  const allRulesSelected = await getCategoryRules(orgId)
  const enabledRulesSelected = allRulesSelected.filter((r) => r.isEnabled)

  const rows = regularItems.map(({ tx, idx }) => {
    const override = overrideMap.get(idx)
    const categoryId = override?.categoryId ?? (
      tx.description && enabledRulesSelected.length > 0
        ? matchCategory(tx.description, enabledRulesSelected)
        : null
    )
    const type = override?.type ?? tx.type
    // If user changed type, flip the sign accordingly
    const amountCents = type === 'income'
      ? Math.abs(tx.amountCents)
      : type === 'expense'
        ? -Math.abs(tx.amountCents)
        : tx.amountCents
    return {
      orgId,
      accountId,
      type,
      amountCents,
      description: tx.description,
      date: tx.date,
      externalId: tx.externalId,
      importedAt,
      categoryId,
      isAutoCategorized: !override?.categoryId && categoryId !== null,
    }
  })

  const destinosPrevistos = new Set<string>()

  const { imported, skipped } = await db.transaction(async (tx) => {
    const [accountRow] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
      .limit(1)

    if (!accountRow) {
      throw new Error(`Account ${accountId} not found or does not belong to this organization`)
    }

    let importedCount = 0
    let skippedCount = 0

    // Insert regular (income/expense) transactions
    if (rows.length > 0) {
      const insertedRows = await tx
        .insert(transactions)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: transactions.id, amountCents: transactions.amountCents })

      importedCount += insertedRows.length
      skippedCount += rows.length - insertedRows.length

      if (insertedRows.length > 0) {
        const totalDelta = insertedRows.reduce((sum, row) => sum + row.amountCents, 0)
        if (totalDelta !== 0) {
          await tx
            .update(accounts)
            .set({ balanceCents: sql`balance_cents + ${totalDelta}` })
            .where(eq(accounts.id, accountId))
        }
      }
    }

    // Transferências: perna da conta importada + a da outra conta própria.
    for (const item of transferItems) {
      const { destinoPrevisto } = await inserirTransferenciaImportada(tx as unknown as Db, {
        orgId,
        accountId,
        destAccountId: item.destAccountId,
        amountCents: item.tx.amountCents,
        description: item.tx.description,
        date: item.tx.date,
        externalId: item.tx.externalId ?? null,
        importedAt,
        categoryId: overrideMap.get(item.idx)?.categoryId ?? null,
      })
      if (destinoPrevisto) destinosPrevistos.add(destinoPrevisto)
      importedCount++
    }

    return { imported: importedCount, skipped: skippedCount }
  })

  revalidatePath('/accounts', 'layout')
  invalidateTag(accountsTag(orgId))

  // A ponta real pode já estar na conta de destino: propõe o par agora.
  for (const conta of destinosPrevistos) {
    try {
      await criarPropostasDeConciliacao(getDb(), orgId, conta)
    } catch (error) {
      console.error('[import] falha ao propor conciliacao da perna prevista:', error)
    }
  }

  // Depois das propostas, não antes: a lista de lançamentos lê as propostas;
  // invalidar antes serviria a tela sem o par recém-proposto.
  revalidatePath('/transactions')
  invalidateTag(transactionsTag(orgId))
  invalidateTag(recentTransactionsTag(orgId, 6))
  invalidateTag(recentTransactionsTag(orgId, 24))

  return { imported, skipped, lote: importedAt.toISOString() }
}
