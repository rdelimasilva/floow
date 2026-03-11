'use server'

import { revalidatePath } from 'next/cache'
import { getDb, accounts, transactions, patrimonySnapshots } from '@floow/db'
import { createAccountSchema, createTransactionSchema } from '@floow/shared'
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

  const activeAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))

  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents)

  const [saved] = await db
    .insert(patrimonySnapshots)
    .values(snapshot)
    .returning()

  revalidatePath('/dashboard')

  return saved
}
