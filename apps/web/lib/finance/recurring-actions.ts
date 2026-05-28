'use server'

/**
 * Server actions for recurring transaction template management and generation.
 * REC-01, REC-02, REC-03, REC-05
 *
 * Separated from actions.ts to stay within the 500-line file size limit (CLAUDE.md).
 */

import { revalidatePath } from 'next/cache'
import { getDb, accounts, transactions, recurringTemplates } from '@floow/db'
import {
  matchCategory,
  advanceByFrequency,
  getOverdueDates,
  generateInstallmentDates,
} from '@floow/core-finance'
import { eq, and, sql } from 'drizzle-orm'
import { getOrgId, getCategoryRules } from './queries'
import { assertAccountOwnership, refreshSnapshot } from './actions'
import {
  accountsTag,
  budgetInvestingTag,
  budgetSpendingTag,
  cfoInsightsTag,
  futureTransactionsTag,
  patrimonyHistoryTag,
  recentTransactionsTag,
  snapshotsTag,
  transactionsTag,
  invalidateTag,
} from '@/lib/cache-tags'
import { triggerCfoAnalysis } from '@/lib/cfo/trigger'

type Db = ReturnType<typeof getDb>

const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const

// ---------------------------------------------------------------------------
// Internal: generate overdue transactions for a template (not a server action)
// ---------------------------------------------------------------------------

async function generateForTemplate(templateId: string, orgId: string): Promise<number> {
  const db = getDb()

  const [template] = await db
    .select()
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
    .limit(1)

  if (!template || !template.isActive) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueDates = getOverdueDates(template.nextDueDate, template.frequency as any, today)
  if (overdueDates.length === 0) return 0

  let resolvedCategoryId = template.categoryId
  let isAutoCategorized = false
  if (!resolvedCategoryId && template.description) {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r: any) => r.isEnabled)
    const matched = matchCategory(template.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  const signedAmount = template.type === 'income' ? template.amountCents : -template.amountCents
  let generated = 0

  await db.transaction(async (tx) => {
    for (const dueDate of overdueDates) {
      const result = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: template.accountId,
          categoryId: resolvedCategoryId,
          type: template.type as any,
          amountCents: signedAmount,
          description: template.description,
          date: dueDate,
          recurringTemplateId: template.id,
          isAutoCategorized,
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id })

      if (result.length > 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
          .where(eq(accounts.id, template.accountId))
        generated++
      }
    }

    const lastDate = overdueDates[overdueDates.length - 1]
    const newNextDueDate = advanceByFrequency(lastDate, template.frequency as any)
    await tx
      .update(recurringTemplates)
      .set({ nextDueDate: newNextDueDate, updatedAt: new Date() })
      .where(eq(recurringTemplates.id, template.id))
  })

  return generated
}

// ---------------------------------------------------------------------------
// REC-01: Create recurring template
// ---------------------------------------------------------------------------

/**
 * Server action: create a new recurring template for the authenticated org.
 * Validates type (income | expense only — no transfer), verifies account ownership.
 */
export async function createRecurringTemplate(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const accountId = formData.get('accountId') as string
  const rawCategoryId = (formData.get('categoryId') as string) || null
  const type = formData.get('type') as string
  const amountCents = parseInt(formData.get('amountCents') as string, 10)
  const description = formData.get('description') as string
  const frequency = formData.get('frequency') as string
  const nextDueDateStr = formData.get('nextDueDate') as string
  const notes = (formData.get('notes') as string) || null
  const endMode = ((formData.get('endMode') as string) || 'indefinite') as 'count' | 'end_date' | 'indefinite'
  const installmentCountRaw = formData.get('installmentCount')
  const installmentCount = installmentCountRaw
    ? parseInt(installmentCountRaw as string, 10)
    : undefined
  const endDateStr = (formData.get('endDate') as string) || null

  if (!accountId) throw new Error('accountId is required')
  if (!type || !['income', 'expense'].includes(type))
    throw new Error('type must be "income" or "expense"')
  if (!amountCents || isNaN(amountCents) || amountCents <= 0)
    throw new Error('amountCents must be a positive integer')
  if (!description || !description.trim()) throw new Error('description is required')
  if (!frequency || !VALID_FREQUENCIES.includes(frequency as any))
    throw new Error(`frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`)
  if (!nextDueDateStr) throw new Error('nextDueDate is required')
  if (!['count', 'end_date', 'indefinite'].includes(endMode))
    throw new Error('endMode inválido')
  if (endMode === 'count' && (!installmentCount || installmentCount < 1))
    throw new Error('installmentCount deve ser um inteiro positivo')
  if (endMode === 'end_date' && !endDateStr)
    throw new Error('endDate obrigatório quando endMode é "end_date"')

  await assertAccountOwnership(db as Db, accountId, orgId)

  const startDate = new Date(nextDueDateStr)
  const endDate = endDateStr ? new Date(endDateStr) : undefined

  // Resolve auto-categorization once
  let resolvedCategoryId: string | null = rawCategoryId
  let isAutoCategorized = false
  if (!resolvedCategoryId && description) {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r: any) => r.isEnabled)
    const matched = matchCategory(description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  // Generate all installment dates upfront (count, end_date, or indefinite up to 60 months)
  const dates = generateInstallmentDates({
    startDate,
    frequency: frequency as any,
    endMode,
    installmentCount,
    endDate,
  })
  if (dates.length === 0) throw new Error('Nenhuma parcela gerada')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastDate = dates[dates.length - 1]
  const newNextDueDate = advanceByFrequency(lastDate, frequency as any)
  const signedAmount = type === 'income' ? amountCents : -amountCents
  const total = dates.length

  const template = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(recurringTemplates)
      .values({
        orgId,
        accountId,
        categoryId: resolvedCategoryId,
        type: type as 'income' | 'expense',
        amountCents,
        description: description.trim(),
        frequency: frequency as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly',
        nextDueDate: newNextDueDate,
        isActive: true,
        notes: notes || null,
        endMode,
        installmentCount: endMode === 'count' ? installmentCount ?? null : null,
        endDate: endMode === 'end_date' && endDate ? endDate : null,
      })
      .returning()

    // Insert all transactions for the generated dates
    let balanceDelta = 0
    const rows = dates.map((installDate, i) => {
      const isApplied = installDate <= today
      if (isApplied) balanceDelta += signedAmount
      return {
        orgId,
        accountId,
        categoryId: resolvedCategoryId,
        type: type as 'income' | 'expense',
        amountCents: signedAmount,
        description: total > 1 ? `${description.trim()} (${i + 1}/${total})` : description.trim(),
        date: installDate,
        recurringTemplateId: t.id,
        balanceApplied: isApplied,
        installmentNumber: total > 1 ? i + 1 : null,
        installmentTotal: total > 1 ? total : null,
        isAutoCategorized,
      }
    })

    await tx.insert(transactions).values(rows)

    if (balanceDelta !== 0) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${balanceDelta}` })
        .where(eq(accounts.id, accountId))
    }

    return t
  })

  revalidatePath('/transactions/recurring')
  revalidatePath('/transactions')

  return template
}

// ---------------------------------------------------------------------------
// REC-02: Update recurring template
// ---------------------------------------------------------------------------

/**
 * Server action: update editable fields on a recurring template scoped to orgId.
 * Only updates fields that are provided in formData.
 */
export async function updateRecurringTemplate(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('id is required')

  const setObj: Record<string, unknown> = { updatedAt: new Date() }

  const accountId = formData.get('accountId') as string | null
  if (accountId) {
    await assertAccountOwnership(db as Db, accountId, orgId)
    setObj.accountId = accountId
  }

  const categoryId = formData.get('categoryId') as string | null
  if (categoryId !== null) setObj.categoryId = categoryId || null

  const type = formData.get('type') as string | null
  if (type !== null) {
    if (!['income', 'expense'].includes(type))
      throw new Error('type must be "income" or "expense"')
    setObj.type = type
  }

  const amountCentsStr = formData.get('amountCents') as string | null
  if (amountCentsStr !== null) {
    const amountCents = parseInt(amountCentsStr, 10)
    if (isNaN(amountCents) || amountCents <= 0)
      throw new Error('amountCents must be a positive integer')
    setObj.amountCents = amountCents
  }

  const description = formData.get('description') as string | null
  if (description !== null) {
    if (!description.trim()) throw new Error('description must not be empty')
    setObj.description = description.trim()
  }

  const frequency = formData.get('frequency') as string | null
  if (frequency !== null) {
    if (!VALID_FREQUENCIES.includes(frequency as any))
      throw new Error(`frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`)
    setObj.frequency = frequency
  }

  const nextDueDateStr = formData.get('nextDueDate') as string | null
  if (nextDueDateStr !== null) setObj.nextDueDate = new Date(nextDueDateStr)

  const notes = formData.get('notes') as string | null
  if (notes !== null) setObj.notes = notes || null

  await db
    .update(recurringTemplates)
    .set(setObj)
    .where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)))

  revalidatePath('/transactions/recurring')
}

// ---------------------------------------------------------------------------
// REC-02: Delete recurring template
// ---------------------------------------------------------------------------

/**
 * Server action: delete a recurring template by ID, scoped to orgId.
 * Does NOT delete previously generated transactions — the FK ON DELETE SET NULL handles that.
 */
export async function deleteRecurringTemplate(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('id is required')

  // Sum balance impact of already-applied transactions per account, then delete
  // all linked transactions and the template, reversing balances atomically.
  await db.transaction(async (tx) => {
    const linked = await tx
      .select({
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        balanceApplied: transactions.balanceApplied,
      })
      .from(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.recurringTemplateId, id)))

    // Aggregate applied amount per account (signed amount already on row)
    const reversalByAccount = new Map<string, number>()
    for (const row of linked) {
      if (row.balanceApplied) {
        reversalByAccount.set(
          row.accountId,
          (reversalByAccount.get(row.accountId) ?? 0) + row.amountCents,
        )
      }
    }

    await tx
      .delete(transactions)
      .where(and(eq(transactions.orgId, orgId), eq(transactions.recurringTemplateId, id)))

    for (const [accountId, applied] of reversalByAccount) {
      if (applied !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents - ${applied}` })
          .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
      }
    }

    await tx
      .delete(recurringTemplates)
      .where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)))
  })

  invalidateTag(transactionsTag(orgId))
  invalidateTag(recentTransactionsTag(orgId, 6))
  invalidateTag(recentTransactionsTag(orgId, 24))
  invalidateTag(futureTransactionsTag(orgId, 24))
  invalidateTag(accountsTag(orgId))
  invalidateTag(budgetSpendingTag(orgId))
  invalidateTag(budgetInvestingTag(orgId))
  invalidateTag(snapshotsTag(orgId))
  invalidateTag(patrimonyHistoryTag(orgId, 12))
  invalidateTag(cfoInsightsTag(orgId))

  // Generate a fresh patrimony snapshot so the dashboard reflects the
  // reversed account balances immediately. Failure here is non-fatal.
  try {
    await refreshSnapshot()
  } catch (err) {
    console.error('[recurring/delete] refreshSnapshot failed:', err)
  }

  triggerCfoAnalysis(orgId, 'transaction_deleted', ['cash_flow', 'budget', 'behavior'])

  revalidatePath('/transactions/recurring')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
}

// ---------------------------------------------------------------------------
// REC-05: Toggle recurring template active/inactive
// ---------------------------------------------------------------------------

/**
 * Server action: flip isActive on a recurring template scoped to orgId.
 * Pausing a template prevents future generation without deleting history.
 */
export async function toggleRecurringActive(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('id is required')

  const [template] = await db
    .select()
    .from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)))
    .limit(1)

  if (!template) throw new Error('Template not found')

  await db
    .update(recurringTemplates)
    .set({ isActive: !template.isActive, updatedAt: new Date() })
    .where(and(eq(recurringTemplates.id, id), eq(recurringTemplates.orgId, orgId)))

  revalidatePath('/transactions/recurring')
}

// ---------------------------------------------------------------------------
// REC-03: Generate recurring transactions
// ---------------------------------------------------------------------------

/**
 * Server action: generate all overdue transactions for a recurring template.
 *
 * Atomically:
 * (a) Computes overdue dates via getOverdueDates()
 * (b) Inserts transactions with dedup guard (onConflictDoNothing on unique index)
 * (c) Updates account balance per inserted transaction only
 * (d) Auto-categorizes using category rules when template has no category
 * (e) Advances nextDueDate past the last generated date
 *
 * Returns { generated: number } — count of newly created transactions.
 *
 * REC-03
 */
export async function generateRecurringTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const templateId = formData.get('templateId') as string
  if (!templateId) throw new Error('templateId required')

  const generated = await generateForTemplate(templateId, orgId)

  revalidatePath('/transactions')
  revalidatePath('/transactions/recurring')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')

  return { generated }
}
