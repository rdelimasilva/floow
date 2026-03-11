'use server'

import { revalidatePath } from 'next/cache'
import { createDb, accounts, transactions } from '@floow/db'
import { createAccountSchema, createTransactionSchema } from '@floow/shared'
import { eq, sql } from 'drizzle-orm'
import { getOrgId } from './queries'

const DATABASE_URL = process.env.DATABASE_URL ?? ''

/**
 * Server action: create a new financial account for the authenticated user's org.
 * Validates input with Zod, inserts into DB, revalidates /accounts.
 */
export async function createAccount(formData: FormData) {
  const orgId = await getOrgId()
  const db = createDb(DATABASE_URL)

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
 */
export async function createTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = createDb(DATABASE_URL)

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

    const transferGroupId = crypto.randomUUID()

    // Insert source (debit) row — negative amount
    const [sourceTransaction] = await db
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
    const [destTransaction] = await db
      .insert(transactions)
      .values({
        orgId,
        accountId: input.transferToAccountId,
        categoryId: input.categoryId ?? null,
        type: 'transfer',
        amountCents: input.amountCents,
        description: input.description,
        date: new Date(input.date),
        transferGroupId,
      })
      .returning()

    // Atomic balance update: source account decremented
    await db
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-input.amountCents}` })
      .where(eq(accounts.id, input.accountId))

    // Atomic balance update: destination account incremented
    await db
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${input.amountCents}` })
      .where(eq(accounts.id, input.transferToAccountId))

    revalidatePath('/transactions')
    revalidatePath('/accounts')

    return [sourceTransaction, destTransaction]
  }

  // income or expense
  const signedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

  const [transaction] = await db
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
  await db
    .update(accounts)
    .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
    .where(eq(accounts.id, input.accountId))

  revalidatePath('/transactions')
  revalidatePath('/accounts')

  return transaction
}
