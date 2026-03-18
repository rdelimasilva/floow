'use server'

import { revalidatePath } from 'next/cache'
import { getDb, accounts, transactions, patrimonySnapshots, categories } from '@floow/db'
import { createAccountSchema, createTransactionSchema, updateAccountSchema, updateTransactionSchema } from '@floow/shared'
import { computeSnapshot } from '@floow/core-finance'
import { eq, sql, and } from 'drizzle-orm'
import { getOrgId } from './queries'
import { getPositions } from '@/lib/investments/queries'

type Db = ReturnType<typeof getDb>

/**
 * Verifies that an account belongs to the given org.
 * Throws if the account does not exist or belongs to a different org.
 * Accepts either a db instance or a transaction client (both share the same query API).
 */
async function assertAccountOwnership(db: Db, accountId: string, orgId: string): Promise<void> {
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

  const input = createAccountSchema.parse({
    name: formData.get('name'),
    type: formData.get('type'),
  })

  const [account] = await db
    .insert(accounts)
    .values({
      orgId,
      name: input.name,
      type: input.type,
    })
    .returning()

  revalidatePath('/accounts')

  return account
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
          categoryId: input.categoryId ?? null,
          type: 'transfer',
          amountCents: -input.amountCents,
          description: input.description,
          date: new Date(input.date),
          transferGroupId,
        })
        .returning()

      // Insert destination (credit) row — positive amount
      const [destTransaction] = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: transferToAccountId,
          categoryId: input.categoryId ?? null,
          type: 'transfer',
          amountCents: input.amountCents,
          description: input.description,
          date: new Date(input.date),
          transferGroupId,
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

    revalidatePath('/transactions')
    revalidatePath('/accounts')

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
        categoryId: input.categoryId ?? null,
        type: input.type,
        amountCents: signedAmount,
        description: input.description,
        date: new Date(input.date),
      })
      .returning()

    // Atomic balance update
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
      .where(eq(accounts.id, input.accountId))

    return transaction
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')

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

  // Reuse the cached getAccounts() instead of a separate raw query
  const { getAccounts } = await import('./queries')
  const activeAccounts = await getAccounts(orgId)

  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents)

  const [saved] = await db
    .insert(patrimonySnapshots)
    .values(snapshot)
    .returning()

  revalidatePath('/dashboard')

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
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
          .where(eq(accounts.id, leg.accountId))
      }

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.transferGroupId, tx.transferGroupId), eq(transactions.orgId, orgId)))
    } else {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
        .where(eq(accounts.id, tx.accountId))

      await dbTx
        .delete(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    }
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
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

    // Reverse old balance impact
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
      .where(eq(accounts.id, oldTx.accountId))

    // Apply new balance impact (handles account change too)
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
      .where(eq(accounts.id, input.accountId))

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
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')
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
  })

  await assertAccountOwnership(db, input.id, orgId)

  const [updated] = await db
    .update(accounts)
    .set({ name: input.name, type: input.type, updatedAt: new Date() })
    .where(and(eq(accounts.id, input.id), eq(accounts.orgId, orgId)))
    .returning()

  revalidatePath('/accounts')
  revalidatePath('/dashboard')

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

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  revalidatePath('/transactions')

  return updated
}

/**
 * Server action: create a new category for the authenticated user's org.
 * Requires a name and type; optional color and icon.
 */
export async function createCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const color = formData.get('color') as string | null
  const icon = formData.get('icon') as string | null

  if (!name || !type) throw new Error('Name and type are required')
  if (!['income', 'expense', 'transfer'].includes(type)) throw new Error('Invalid category type')

  const [category] = await db
    .insert(categories)
    .values({
      orgId,
      name,
      type: type as 'income' | 'expense' | 'transfer',
      color: color || null,
      icon: icon || null,
    })
    .returning()

  revalidatePath('/categories')
  revalidatePath('/transactions')

  return category
}

/**
 * Server action: update an existing category.
 * Only org-owned (non-system) categories can be updated.
 */
export async function updateCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const color = formData.get('color') as string | null
  const icon = formData.get('icon') as string | null

  if (!id || !name || !type) throw new Error('ID, name, and type are required')

  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.orgId, orgId)))
    .limit(1)

  if (!existing) throw new Error('Category not found or is a system category')

  const [updated] = await db
    .update(categories)
    .set({
      name,
      type: type as 'income' | 'expense' | 'transfer',
      color: color || null,
      icon: icon || null,
    })
    .where(and(eq(categories.id, id), eq(categories.orgId, orgId)))
    .returning()

  revalidatePath('/categories')
  revalidatePath('/transactions')

  return updated
}

/**
 * Server action: delete a category owned by the org.
 * System categories cannot be deleted.
 * Transactions using this category will have their categoryId set to null (DB onDelete: 'set null').
 */
export async function deleteCategory(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string
  if (!id) throw new Error('Category ID is required')

  const [existing] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.orgId, orgId)))
    .limit(1)

  if (!existing) throw new Error('Category not found or is a system category')

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.orgId, orgId)))

  revalidatePath('/categories')
  revalidatePath('/transactions')
}
