'use server'
import { getDb, accounts, transactions, patrimonySnapshots, categories, categoryRules, recurringTemplates, budgetEntries, debts } from '@floow/db'
import { createAccountSchema, createTransactionSchema, updateAccountSchema, updateTransactionSchema, createRecurringTransactionSchema } from '@floow/shared'
import { computeSnapshot, matchCategory, generateInstallmentDates, advanceByFrequency } from '@floow/core-finance'
import { eq, sql, and, or, desc, isNull, ilike, count, max, inArray } from 'drizzle-orm'
import { getOrgId, getCategoryRules } from './queries'
import { escapeLikePattern } from './sql-utils'
import { getPositions } from '@/lib/investments/queries'
import {
  accountsTag,
  budgetSpendingTag,
  categoriesTag,
  futureTransactionsTag,
  investmentsTag,
  patrimonyHistoryTag,
  recentTransactionsTag,
  snapshotsTag,
  transactionsTag,
  invalidateTag,
} from '@/lib/cache-tags'
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'
import {
  revalidateCategoryData,
  revalidateSnapshotData,
  revalidateTransactionData,
} from './revalidate'

type Db = ReturnType<typeof getDb>

function revalidateAccountData(orgId: string) {
  invalidateTag(accountsTag(orgId))
}


function revalidateInvestmentData(orgId: string) {
  invalidateTag(investmentsTag(orgId))
}

/**
 * Verifies that an account belongs to the given org.
 * Throws if the account does not exist or belongs to a different org.
 * Accepts either a db instance or a transaction client (both share the same query API).
 */
export async function assertAccountOwnership(db: Db, accountId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw new Error(`Account ${accountId} not found or does not belong to this organization`)
  }
}

/**
 * Server action: create a new financial account for the authenticated user's org.
 * Validates input with Zod, inserts into DB, revalidates /accounts.
 */
export async function createAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawInitialBalance = formData.get('initialBalanceCents')
  const initialBalanceCents = rawInitialBalance != null && rawInitialBalance !== ''
    ? parseInt(rawInitialBalance as string, 10)
    : undefined

  const input = createAccountSchema.parse({
    name: formData.get('name'),
    type: formData.get('type'),
    branch: formData.get('branch') || undefined,
    accountNumber: formData.get('accountNumber') || undefined,
    initialBalanceCents: Number.isFinite(initialBalanceCents) ? initialBalanceCents : undefined,
  })

  const [account] = await db
    .insert(accounts)
    .values({
      orgId,
      name: input.name,
      type: input.type,
      branch: input.branch ?? null,
      accountNumber: input.accountNumber ?? null,
      balanceCents: input.initialBalanceCents ?? 0,
    })
    .returning()

  revalidateAccountData(orgId)

  return account
}

/**
 * Server action: adjust an account's balance to a specific target value by
 * inserting a single income/expense transaction whose amount equals the delta.
 *
 * Why a transaction (not a direct UPDATE on balance_cents):
 *   - The account balance is the sum of all signed transaction amounts.
 *   - A direct balance edit would desync balance_cents from the transaction
 *     history → "details show R$ X but sum is R$ Y" bugs.
 *   - A delta transaction keeps the invariant and preserves audit trail.
 *
 * If delta == 0 the call is a no-op (no transaction inserted).
 */
export async function adjustAccountBalance(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const accountId = formData.get('accountId') as string
  const newBalanceRaw = formData.get('newBalanceCents') as string
  const description = ((formData.get('description') as string) || '').trim()
  const dateRaw = (formData.get('date') as string) || ''

  if (!accountId) throw new Error('accountId é obrigatório')
  const newBalanceCents = parseInt(newBalanceRaw, 10)
  if (!Number.isFinite(newBalanceCents)) throw new Error('Novo saldo inválido')

  // Date: YYYY-MM-DD from date input, fallback to today. Anchored to noon local
  // to avoid timezone-shift edge cases (a midnight date in UTC-3 becomes the
  // previous day when stored as UTC).
  let txDate: Date
  if (dateRaw) {
    const parsed = new Date(`${dateRaw}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) throw new Error('Data inválida')
    txDate = parsed
  } else {
    txDate = new Date()
  }

  await assertAccountOwnership(db, accountId, orgId)

  const [current] = await db
    .select({ balanceCents: accounts.balanceCents })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1)
  if (!current) throw new Error('Conta não encontrada')

  const delta = newBalanceCents - current.balanceCents
  if (delta === 0) {
    return { adjusted: false as const, delta: 0 }
  }

  const txType: 'income' | 'expense' = delta > 0 ? 'income' : 'expense'
  const finalDescription = description
    ? `Ajuste de saldo — ${description}`
    : 'Ajuste de saldo'

  await db.transaction(async (tx) => {
    await tx.insert(transactions).values({
      orgId,
      accountId,
      type: txType,
      amountCents: delta,
      description: finalDescription,
      date: txDate,
      balanceApplied: true,
    })

    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${delta}` })
      .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
  })

  revalidateAccountData(orgId)
  revalidateTransactionData(orgId)
  revalidateSnapshotData(orgId)

  return { adjusted: true as const, delta }
}

/**
 * Server action: register a financial transaction (income, expense, or transfer).
 *
 * For transfers:
 *   - Inserts TWO rows (debit from source, credit to destination)
 *   - Both rows share a transferGroupId (UUID)
 *   - Source row: negative amountCents
 *   - Destination row: positive amountCents
 *   - Both account balances updated atomically using sql`balance_cents + ${delta}`
 *
 * For income/expense:
 *   - Inserts ONE row
 *   - Account balance updated atomically
 *
 * CRITICAL: Uses sql`balance_cents + ${delta}` for atomic balance updates
 * (never read-modify-write — race condition risk).
 *
 * Wrapped in a db.transaction so failure at any step rolls back all writes.
 * Ownership of all accounts is verified against the user's orgId before writes.
 */
export async function createTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawAmountCents = parseInt(formData.get('amountCents') as string, 10)

  const input = createTransactionSchema.parse({
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: rawAmountCents,
    description: formData.get('description'),
    date: formData.get('date'),
    transferToAccountId: formData.get('transferToAccountId') || undefined,
  })

  // Auto-categorize: apply rules when no explicit category and not a transfer
  let resolvedCategoryId = input.categoryId ?? null
  let isAutoCategorized = false

  if (!resolvedCategoryId && input.description && input.type !== 'transfer') {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r) => r.isEnabled)
    const matched = matchCategory(input.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  if (input.type === 'transfer') {
    if (!input.transferToAccountId) {
      throw new Error('transferToAccountId is required for transfer transactions')
    }

    const transferToAccountId = input.transferToAccountId

    const result = await db.transaction(async (tx) => {
      // Verify both accounts belong to the org before any write
      await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)
      await assertAccountOwnership(tx as unknown as Db, transferToAccountId, orgId)

      const transferGroupId = crypto.randomUUID()

      // Insert source (debit) row — negative amount
      const [sourceTransaction] = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: input.accountId,
          categoryId: resolvedCategoryId,
          type: 'transfer',
          amountCents: -input.amountCents,
          description: input.description,
          date: new Date(input.date),
          transferGroupId,
          isAutoCategorized,
        })
        .returning()

      // Insert destination (credit) row — positive amount
      const [destTransaction] = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: transferToAccountId,
          categoryId: resolvedCategoryId,
          type: 'transfer',
          amountCents: input.amountCents,
          description: input.description,
          date: new Date(input.date),
          transferGroupId,
          isAutoCategorized,
        })
        .returning()

      // Atomic balance update: source account decremented
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-input.amountCents}` })
        .where(eq(accounts.id, input.accountId))

      // Atomic balance update: destination account incremented
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${input.amountCents}` })
        .where(eq(accounts.id, transferToAccountId))

      return [sourceTransaction, destTransaction]
    })

    revalidateTransactionData(orgId)
    revalidateAccountData(orgId)
    triggerCfoAnalysis(orgId, 'transaction_created', ['cash_flow', 'budget', 'behavior'])

    return result
  }

  // income or expense
  const signedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

  const result = await db.transaction(async (tx) => {
    // Verify the account belongs to the org before any write
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)

    const [transaction] = await tx
      .insert(transactions)
      .values({
        orgId,
        accountId: input.accountId,
        categoryId: resolvedCategoryId,
        type: input.type,
        amountCents: signedAmount,
        description: input.description,
        date: new Date(input.date),
        isAutoCategorized,
      })
      .returning()

    // Atomic balance update
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
      .where(eq(accounts.id, input.accountId))

    return transaction
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  triggerCfoAnalysis(orgId, 'transaction_created', ['cash_flow', 'budget', 'behavior'])

  return result
}

/**
 * Server action: create a recurring transaction series.
 * Generates all installments in batch within a single db.transaction().
 * Future transactions (date > today) have balance_applied = false.
 * A recurring_templates record is created as metadata for cancellation/tracking.
 */
export async function createRecurringTransactions(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawAmountCents = parseInt(formData.get('amountCents') as string, 10)
  const rawInstallmentCount = formData.get('installmentCount')
    ? parseInt(formData.get('installmentCount') as string, 10)
    : undefined

  const input = createRecurringTransactionSchema.parse({
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: rawAmountCents,
    description: formData.get('description'),
    startDate: formData.get('startDate'),
    frequency: formData.get('frequency'),
    endMode: formData.get('endMode'),
    installmentCount: rawInstallmentCount,
    endDate: formData.get('endDate') || undefined,
    destinationAccountId: formData.get('destinationAccountId') || undefined,
  })

  // Generate all installment dates
  const dates = generateInstallmentDates({
    startDate: input.startDate,
    frequency: input.frequency,
    endMode: input.endMode,
    installmentCount: input.installmentCount,
    endDate: input.endDate,
  })

  if (dates.length === 0) throw new Error('Nenhuma parcela gerada')

  const total = dates.length

  // Auto-categorize before entering transaction (avoid query inside tx)
  let resolvedCategoryId = input.categoryId ?? null
  let isAutoCategorized = false
  if (!resolvedCategoryId && input.description && input.type !== 'transfer') {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r) => r.isEnabled)
    const matched = matchCategory(input.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  // Calculate "today" in Brazil timezone for balance_applied determination
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const today = new Date(todayStr)

  const result = await db.transaction(async (tx) => {
    // Verify account ownership and active status
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)
    if (input.type === 'transfer' && input.destinationAccountId) {
      await assertAccountOwnership(tx as unknown as Db, input.destinationAccountId, orgId)
    }

    // Verify accounts are active
    const [srcAccount] = await tx
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1)
    if (!srcAccount?.isActive) throw new Error('Conta de origem está inativa')

    if (input.type === 'transfer' && input.destinationAccountId) {
      const [dstAccount] = await tx
        .select({ isActive: accounts.isActive })
        .from(accounts)
        .where(eq(accounts.id, input.destinationAccountId))
        .limit(1)
      if (!dstAccount?.isActive) throw new Error('Conta de destino está inativa')
    }

    // Calculate next_due_date (date after last installment)
    const lastDate = dates[dates.length - 1]
    const nextDueDate = advanceByFrequency(lastDate, input.frequency)

    // Insert template
    const [template] = await tx
      .insert(recurringTemplates)
      .values({
        orgId,
        accountId: input.accountId,
        categoryId: resolvedCategoryId,
        type: input.type,
        amountCents: input.amountCents,
        description: input.description,
        frequency: input.frequency,
        nextDueDate,
        isActive: true,
        endMode: input.endMode,
        installmentCount: input.endMode === 'count' ? input.installmentCount : null,
        endDate: input.endMode === 'end_date' ? input.endDate : null,
        transferDestinationAccountId: input.type === 'transfer' ? input.destinationAccountId : null,
      })
      .returning()

    // Build transaction rows
    let sourceBalanceDelta = 0
    let destBalanceDelta = 0

    if (input.type === 'transfer' && input.destinationAccountId) {
      // Transfer: batch insert pairs
      const sourceRows = []
      const destRows = []
      for (let i = 0; i < dates.length; i++) {
        const installDate = dates[i]
        const isApplied = installDate <= today
        const transferGroupId = crypto.randomUUID()
        const desc = `${input.description} (${i + 1}/${total})`

        sourceRows.push({
          orgId,
          accountId: input.accountId,
          categoryId: null,
          type: 'transfer' as const,
          amountCents: -input.amountCents,
          description: desc,
          date: installDate,
          transferGroupId,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized: false,
        })

        destRows.push({
          orgId,
          accountId: input.destinationAccountId,
          categoryId: null,
          type: 'transfer' as const,
          amountCents: input.amountCents,
          description: desc,
          date: installDate,
          transferGroupId,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized: false,
        })

        if (isApplied) {
          sourceBalanceDelta += -input.amountCents
          destBalanceDelta += input.amountCents
        }
      }

      await tx.insert(transactions).values(sourceRows)
      await tx.insert(transactions).values(destRows)

      // Update balances
      if (sourceBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${sourceBalanceDelta}` })
          .where(eq(accounts.id, input.accountId))
      }
      if (destBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${destBalanceDelta}` })
          .where(eq(accounts.id, input.destinationAccountId))
      }
    } else {
      // Income or expense — batch insert
      const signedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

      const rows = dates.map((installDate, i) => {
        const isApplied = installDate <= today
        if (isApplied) sourceBalanceDelta += signedAmount
        return {
          orgId,
          accountId: input.accountId,
          categoryId: resolvedCategoryId,
          type: input.type,
          amountCents: signedAmount,
          description: `${input.description} (${i + 1}/${total})`,
          date: installDate,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized,
        }
      })

      await tx.insert(transactions).values(rows)

      // Update balance
      if (sourceBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${sourceBalanceDelta}` })
          .where(eq(accounts.id, input.accountId))
      }
    }

    return template
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  triggerCfoAnalysis(orgId, 'transaction_created', ['cash_flow', 'budget', 'behavior'])

  return result
}

/**
 * Server action: compute and save a new patrimony snapshot for the authenticated user's org.
 * Fetches all active accounts, computes net worth, and saves to patrimony_snapshots.
 * Revalidates the dashboard page so the updated snapshot appears immediately.
 */
export async function refreshSnapshot() {
  const orgId = await getOrgId()
  const db = getDb()

  // Include investment portfolio value in net worth calculation (DASH-03 / Phase 3)
  // Gracefully handles the case where no investments exist (returns 0)
  let investmentValueCents = 0
  try {
    const positions = await getPositions(orgId)
    investmentValueCents = positions.reduce((sum, p) => sum + p.currentValueCents, 0)
  } catch {
    // If investment queries fail (e.g., table not yet migrated), fall back to 0
    investmentValueCents = 0
  }

  // Include fixed assets estimated value in net worth
  let fixedAssetValueCents = 0
  try {
    const { getFixedAssets } = await import('@/lib/fixed-assets/queries')
    const assets = await getFixedAssets(orgId)
    const { estimateAssetValue } = await import('@floow/core-finance')
    const now = new Date()
    fixedAssetValueCents = assets.reduce((sum, a) => {
      const baseDate = a.currentValueDate instanceof Date ? a.currentValueDate : new Date(a.currentValueDate)
      return sum + estimateAssetValue(a.currentValueCents, baseDate, Number(a.annualRate), now)
    }, 0)
  } catch {
    fixedAssetValueCents = 0
  }

  // Reuse the cached getAccounts() instead of a separate raw query
  const { getAccounts } = await import('./queries')
  const activeAccounts = await getAccounts(orgId)

  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents, fixedAssetValueCents)

  const [saved] = await db
    .insert(patrimonySnapshots)
    .values(snapshot)
    .returning()

  revalidateSnapshotData(orgId)

  return saved
}

/**
 * Server action: delete a transaction and reverse its balance impact.
 * For transfers, deletes both legs and reverses both balance changes.
 * Wrapped in a db.transaction for atomicity.
 */
export async function deleteTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const transactionId = formData.get('id') as string
  if (!transactionId) throw new Error('Transaction ID is required')

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!tx) throw new Error('Transaction not found')

  await db.transaction(async (dbTx) => {
    if (tx.transferGroupId) {
      const legs = await dbTx
        .select()
        .from(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))

      for (const leg of legs) {
        // Only reverse balance if it was already applied
        if (leg.balanceApplied) {
          await dbTx
            .update(accounts)
            .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
            .where(eq(accounts.id, leg.accountId))
        }
      }

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))
    } else {
      // Only reverse balance if it was already applied
      if (tx.balanceApplied) {
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
          .where(eq(accounts.id, tx.accountId))
      }

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Server action: toggle the is_ignored flag on an imported transaction.
 * When ignoring: reverses the balance impact (as if the transaction didn't exist).
 * When un-ignoring: re-applies the balance impact.
 * Only works on imported transactions (externalId IS NOT NULL).
 */
export async function toggleIgnoreTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const transactionId = formData.get('id') as string
  if (!transactionId) throw new Error('Transaction ID is required')

  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!tx) throw new Error('Transação não encontrada')
  if (!tx.externalId) throw new Error('Apenas transações importadas podem ser ignoradas')

  const newIgnored = !tx.isIgnored
  // If ignoring: reverse balance. If un-ignoring: re-apply balance.
  const balanceDelta = newIgnored ? -tx.amountCents : tx.amountCents

  await db.transaction(async (dbTx) => {
    await dbTx
      .update(transactions)
      .set({ isIgnored: newIgnored })
      .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))

    await dbTx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${balanceDelta}` })
      .where(eq(accounts.id, tx.accountId))
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Server action: update an existing transaction's fields and adjust account balances.
 * Reverses the old balance impact, applies the new one, and updates the row.
 * Transfer transactions cannot be edited — they must be deleted and recreated.
 */
export async function updateTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateTransactionSchema.parse({
    id: formData.get('id'),
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: parseInt(formData.get('amountCents') as string, 10),
    description: formData.get('description'),
    date: formData.get('date'),
  })

  const [oldTx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!oldTx) throw new Error('Transaction not found')
  if (oldTx.transferGroupId) throw new Error('Cannot edit transfer transactions. Delete and recreate instead.')

  const newSignedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

  await db.transaction(async (tx) => {
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)

    // Reverse old balance impact only if it was applied
    if (oldTx.balanceApplied) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
        .where(eq(accounts.id, oldTx.accountId))
    }

    // Determine if the updated transaction should have balance applied
    const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const nowDate = new Date(nowStr)
    const editedDate = new Date(input.date)
    const shouldApplyBalance = editedDate <= nowDate || !oldTx.recurringTemplateId

    // Apply new balance impact only if the date qualifies
    if (shouldApplyBalance) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
        .where(eq(accounts.id, input.accountId))
    }

    // Update balance_applied flag if this is a recurring transaction
    const balanceAppliedValue = oldTx.recurringTemplateId ? shouldApplyBalance : true

    // Update the transaction row
    await tx
      .update(transactions)
      .set({
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amountCents: newSignedAmount,
        description: input.description,
        date: new Date(input.date),
        balanceApplied: balanceAppliedValue,
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Server action: update an existing financial account's name and type.
 * Validates input with Zod, verifies ownership, updates in DB, revalidates pages.
 */
export async function updateAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const input = updateAccountSchema.parse({
    id: formData.get('id'),
    name: formData.get('name'),
    type: formData.get('type'),
    branch: formData.get('branch') || undefined,
    accountNumber: formData.get('accountNumber') || undefined,
  })

  await assertAccountOwnership(db, input.id, orgId)

  const [updated] = await db
    .update(accounts)
    .set({
      name: input.name,
      type: input.type,
      branch: input.branch ?? null,
      accountNumber: input.accountNumber ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, input.id), eq(accounts.orgId, orgId)))
    .returning()

  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)

  return updated
}

/**
 * Server action: soft-delete a financial account by setting isActive to false.
 * Verifies ownership before deactivation. Transactions are preserved.
 */
export async function deleteAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const accountId = formData.get('id') as string
  if (!accountId) throw new Error('Account ID is required')

  await assertAccountOwnership(db, accountId, orgId)

  const [updated] = await db
    .update(accounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .returning()

  revalidateAccountData(orgId)
  revalidateTransactionData(orgId)
  revalidateSnapshotData(orgId)

  return updated
}


// ---------------------------------------------------------------------------
// Categorization Rule Actions — CAT-01, CAT-02, CAT-06
// ---------------------------------------------------------------------------

/**
 * Calculates priority automatically based on rule specificity.
 * - 'exact' rules get higher base priority than 'contains'
 * - Longer matchValue = more specific = higher priority
 */
function calcRulePriority(matchType: string, matchValue: string): number {
  const base = matchType === 'exact' ? 1000 : 0
  return base + matchValue.trim().length
}

/**
 * Server action: create a new categorization rule for the authenticated org.
 * Priority is auto-calculated from specificity (exact > contains, longer > shorter).
 * CAT-01
 */
export async function createRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const matchType = formData.get('matchType') as string
  const matchValue = formData.get('matchValue') as string
  const categoryId = formData.get('categoryId') as string

  if (!matchType || !matchValue || !categoryId) {
    throw new Error('matchType, matchValue, and categoryId are required')
  }
  if (!['contains', 'exact'].includes(matchType)) {
    throw new Error('Invalid matchType — must be "contains" or "exact"')
  }
  if (!matchValue.trim()) {
    throw new Error('matchValue must not be empty')
  }

  const priority = calcRulePriority(matchType, matchValue)

  const [rule] = await db
    .insert(categoryRules)
    .values({
      orgId,
      matchType: matchType as 'contains' | 'exact',
      matchValue: matchValue.trim(),
      categoryId,
      priority,
      isEnabled: true,
    })
    .returning()

  revalidateCategoryData(orgId)
  return rule
}

/**
 * Server action: update fields of an existing categorization rule.
 * Only updates provided fields; always updates updatedAt.
 * CAT-02
 */
export async function updateRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  const setObj: Record<string, unknown> = { updatedAt: new Date() }

  const matchType = formData.get('matchType') as string | null
  if (matchType !== null) {
    if (!['contains', 'exact'].includes(matchType)) {
      throw new Error('Invalid matchType — must be "contains" or "exact"')
    }
    setObj.matchType = matchType
  }

  const matchValue = formData.get('matchValue') as string | null
  if (matchValue !== null) {
    if (!matchValue.trim()) throw new Error('matchValue must not be empty')
    setObj.matchValue = matchValue.trim()
  }

  const categoryId = formData.get('categoryId') as string | null
  if (categoryId !== null) setObj.categoryId = categoryId

  // Recalculate priority if matchType or matchValue changed
  const finalMatchType = (setObj.matchType as string) ?? null
  const finalMatchValue = (setObj.matchValue as string) ?? null
  if (finalMatchType || finalMatchValue) {
    // Need current values for fields not being updated
    const [current] = await db
      .select({ matchType: categoryRules.matchType, matchValue: categoryRules.matchValue })
      .from(categoryRules)
      .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))
      .limit(1)
    if (current) {
      setObj.priority = calcRulePriority(
        finalMatchType ?? current.matchType,
        finalMatchValue ?? current.matchValue,
      )
    }
  }

  await db
    .update(categoryRules)
    .set(setObj)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: delete a categorization rule scoped to the authenticated org.
 * CAT-02
 */
export async function deleteRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  await db
    .delete(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: move a rule up or down in priority order by swapping priority values.
 * Swaps the target rule with its adjacent neighbour (direction: 'up' = higher priority, 'down' = lower).
 * No-op if the rule is already at the boundary.
 * CAT-02
 */
export async function reorderRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  const direction = formData.get('direction') as string
  if (!id) throw new Error('Rule ID is required')
  if (direction !== 'up' && direction !== 'down') throw new Error('direction must be "up" or "down"')

  // Fetch all rules sorted by priority DESC
  const rules = await getCategoryRules(orgId)
  const idx = rules.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('Rule not found')

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rules.length) return // already at boundary

  const a = rules[idx]
  const b = rules[swapIdx]

  await db.transaction(async (tx) => {
    await tx
      .update(categoryRules)
      .set({ priority: b.priority, updatedAt: new Date() })
      .where(and(eq(categoryRules.id, a.id), eq(categoryRules.orgId, orgId)))
    await tx
      .update(categoryRules)
      .set({ priority: a.priority, updatedAt: new Date() })
      .where(and(eq(categoryRules.id, b.id), eq(categoryRules.orgId, orgId)))
  })

  revalidateCategoryData(orgId)
}

/**
 * Server action: toggle the isEnabled flag on a categorization rule.
 * CAT-02
 */
export async function toggleEnabled(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Rule ID is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  await db
    .update(categoryRules)
    .set({ isEnabled: !rule.isEnabled, updatedAt: new Date() })
    .where(and(eq(categoryRules.id, id), eq(categoryRules.orgId, orgId)))

  revalidateCategoryData(orgId)
}

/**
 * Server action: preview how many uncategorized transactions would be affected by a rule.
 * Returns { count } without modifying any data.
 * CAT-06
 */
export async function previewBulkRecategorize(formData: FormData): Promise<{ count: number }> {
  const orgId = await getOrgId()
  const db = getDb()

  const ruleId = formData.get('ruleId') as string
  if (!ruleId) throw new Error('ruleId is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  const matchCondition =
    rule.matchType === 'exact'
      ? ilike(transactions.description, rule.matchValue)
      : ilike(transactions.description, `%${escapeLikePattern(rule.matchValue)}%`)

  const [result] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), isNull(transactions.categoryId), matchCondition))

  return { count: result.total }
}

/**
 * Server action: retroactively apply a rule to all uncategorized matching transactions.
 * Only affects transactions where categoryId IS NULL (never overwrites manual categories).
 * Sets isAutoCategorized=true on updated rows.
 * CAT-06
 */
export async function bulkRecategorize(formData: FormData): Promise<{ updated: number }> {
  const orgId = await getOrgId()
  const db = getDb()

  const ruleId = formData.get('ruleId') as string
  if (!ruleId) throw new Error('ruleId is required')

  const [rule] = await db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)

  if (!rule) throw new Error('Rule not found')

  const matchCondition =
    rule.matchType === 'exact'
      ? ilike(transactions.description, rule.matchValue)
      : ilike(transactions.description, `%${escapeLikePattern(rule.matchValue)}%`)

  const updated = await db
    .update(transactions)
    .set({ categoryId: rule.categoryId, isAutoCategorized: true })
    .where(and(eq(transactions.orgId, orgId), isNull(transactions.categoryId), matchCondition))
    .returning({ id: transactions.id })

  revalidateTransactionData(orgId)
  revalidateCategoryData(orgId)

  return { updated: updated.length }
}

/**
 * Server action: cancel a recurring transaction series.
 * Deletes all future transactions (date > today) and marks template inactive.
 * Uses date > today (strictly greater) — today's transactions may already be reconciled.
 */
export async function cancelRecurring(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const templateId = formData.get('templateId') as string
  if (!templateId) throw new Error('Template ID is required')

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  await db.transaction(async (tx) => {
    // Verify template belongs to org
    const [template] = await tx
      .select({ id: recurringTemplates.id })
      .from(recurringTemplates)
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
      .limit(1)

    if (!template) throw new Error('Template não encontrado')

    // Delete future transactions (balance_applied is false for these, no balance reversal needed)
    await tx
      .delete(transactions)
      .where(
        and(
          eq(transactions.recurringTemplateId, templateId),
          eq(transactions.orgId, orgId),
          sql`${transactions.date} > ${todayStr}::date`
        )
      )

    // Mark template inactive
    await tx
      .update(recurringTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
}

/**
 * Reconciles balance for recurring transactions whose date has arrived.
 * Called from the app layout — short-circuits if no pending transactions exist.
 * Finds all transactions with balance_applied = false AND date <= today,
 * groups by account, and applies the cumulative balance delta.
 * Uses getOrgId() internally for authentication — safe to expose as server action.
 */
export async function reconcileRecurringBalances() {
  const orgId = await getOrgId()
  const db = getDb()

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  // Short-circuit: check if any pending transactions exist
  const pending = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.balanceApplied, false),
        sql`${transactions.date} <= ${todayStr}::date`
      )
    )
    .limit(1)

  if (pending.length === 0) return

  // Fetch all pending transactions to reconcile
  const pendingTxs = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.balanceApplied, false),
        sql`${transactions.date} <= ${todayStr}::date`
      )
    )

  // Group by account and apply in bulk to avoid N update statements.
  const deltaByAccount = new Map<string, number>()
  const txIds: string[] = []
  for (const tx of pendingTxs) {
    deltaByAccount.set(tx.accountId, (deltaByAccount.get(tx.accountId) ?? 0) + tx.amountCents)
    txIds.push(tx.id)
  }

  await db.transaction(async (dbTx) => {
    const deltas = Array.from(deltaByAccount.entries())
    if (deltas.length > 0) {
      const cases = sql.join(
        deltas.map(([accountId, delta]) => sql`WHEN ${accounts.id} = ${accountId} THEN ${delta}`),
        sql.raw(' ')
      )
      const ids = deltas.map(([accountId]) => accountId)

      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`${accounts.balanceCents} + CASE ${cases} ELSE 0 END` })
        .where(inArray(accounts.id, ids))
    }

    await dbTx
      .update(transactions)
      .set({ balanceApplied: true })
      .where(inArray(transactions.id, txIds))
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
  revalidateInvestmentData(orgId)
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Bulk delete transactions by IDs. Reverses balance for each and handles transfers.
 */
export async function bulkDeleteTransactions(ids: string[]) {
  if (ids.length === 0) return

  const orgId = await getOrgId()
  const db = getDb()

  const txRows = await db
    .select()
    .from(transactions)
    .where(and(inArray(transactions.id, ids), eq(transactions.orgId, orgId)))

  if (txRows.length === 0) return

  // Collect all transfer group IDs to delete both legs
  const transferGroupIds = new Set(txRows.filter((t) => t.transferGroupId).map((t) => t.transferGroupId!))
  const standaloneIds = txRows.filter((t) => !t.transferGroupId).map((t) => t.id)

  await db.transaction(async (dbTx) => {
    // Handle transfers (both legs)
    for (const groupId of transferGroupIds) {
      const legs = await dbTx.select().from(transactions)
        .where(and(eq(transactions.transferGroupId, groupId), eq(transactions.orgId, orgId)))

      for (const leg of legs) {
        if (leg.balanceApplied) {
          await dbTx.update(accounts)
            .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
            .where(eq(accounts.id, leg.accountId))
        }
      }

      await dbTx.delete(transactions)
        .where(and(eq(transactions.transferGroupId, groupId), eq(transactions.orgId, orgId)))
    }

    // Handle standalone transactions
    if (standaloneIds.length > 0) {
      const standalone = txRows.filter((t) => !t.transferGroupId && t.balanceApplied)
      // Reverse balances grouped by account
      const deltaByAccount = new Map<string, number>()
      for (const t of standalone) {
        deltaByAccount.set(t.accountId, (deltaByAccount.get(t.accountId) ?? 0) - t.amountCents)
      }
      for (const [accountId, delta] of deltaByAccount) {
        if (delta !== 0) {
          await dbTx.update(accounts)
            .set({ balanceCents: sql`balance_cents + ${delta}` })
            .where(eq(accounts.id, accountId))
        }
      }

      await dbTx.delete(transactions)
        .where(and(inArray(transactions.id, standaloneIds), eq(transactions.orgId, orgId)))
    }
  })

  revalidateTransactionData(orgId)
  revalidateAccountData(orgId)
  revalidateSnapshotData(orgId)
}

/**
 * Bulk update category for transactions by IDs.
 */
export async function bulkCategorizeTransactions(ids: string[], categoryId: string | null) {
  if (ids.length === 0) return

  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(transactions)
    .set({ categoryId, isAutoCategorized: false })
    .where(and(inArray(transactions.id, ids), eq(transactions.orgId, orgId)))

  revalidateTransactionData(orgId)
}
