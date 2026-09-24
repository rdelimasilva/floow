'use server'
import { getDb, accounts, transactions, patrimonySnapshots } from '@floow/db'
import { createAccountSchema, updateAccountSchema } from '@floow/shared'
import { computeSnapshot } from '@floow/core-finance'

import { eq, sql, and } from 'drizzle-orm'
import { getOrgId } from './queries'
import { getPositions } from '@/lib/investments/queries'
import {
  revalidateAccountData,
  revalidateSnapshotData,
  revalidateTransactionData,
} from './revalidate'

type Db = ReturnType<typeof getDb>

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
