'use server'
import { getDb, accounts, transactions, recurringTemplates } from '@floow/db'
import { createTransactionSchema, createRecurringTransactionSchema } from '@floow/shared'
import { matchCategory, generateInstallmentDates, advanceByFrequency } from '@floow/core-finance'

import { eq, sql } from 'drizzle-orm'
import { getOrgId, getCategoryRules } from './queries'
import { assertAccountOwnership } from './account-actions'
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'
import { revalidateAccountData, revalidateTransactionData } from './revalidate'

type Db = ReturnType<typeof getDb>

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
      throw new Error('Transferência exige a conta de destino.')
    }
    if (input.transferToAccountId === input.accountId) {
      throw new Error('A conta de destino não pode ser a mesma conta de origem.')
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
