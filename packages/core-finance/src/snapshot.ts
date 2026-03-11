/**
 * Patrimony snapshot computation for the Floow finance engine.
 *
 * computeSnapshot: Pure function — takes an array of Account objects and computes
 * net worth, liquid assets, liabilities, and per-type breakdown.
 *
 * computeAndSaveSnapshot: DB-connected async function that fetches active accounts,
 * calls computeSnapshot, and saves the result to patrimonySnapshots.
 */

import type { Account, NewPatrimonySnapshot } from '@floow/db'
import { createDb, accounts, patrimonySnapshots } from '@floow/db'
import { eq, and } from 'drizzle-orm'

/**
 * Pure function: computes a patrimony snapshot from an array of Account objects.
 *
 * Rules:
 *  - credit_card type accounts → their balance (negative) becomes a positive liability
 *  - All other account types → liquid assets (positive balances)
 *  - netWorthCents = liquidAssetsCents - liabilitiesCents
 *  - breakdown: JSON-serialized object with per-account-type totals
 *
 * @param accountList - Array of Account objects (should be active accounts only)
 * @param orgId - Organization ID to attach to the snapshot
 * @returns NewPatrimonySnapshot ready for DB insertion (no id/createdAt)
 */
export function computeSnapshot(
  accountList: Account[],
  orgId: string,
): NewPatrimonySnapshot {
  const breakdown: Record<string, number> = {}

  let liquidAssetsCents = 0
  let liabilitiesCents = 0

  for (const account of accountList) {
    const bal = account.balanceCents
    const type = account.type

    // Accumulate per-type breakdown (use raw balance for breakdown)
    breakdown[type] = (breakdown[type] ?? 0) + bal

    if (type === 'credit_card') {
      // Credit card balance is typically negative (debt owed).
      // Liability = absolute value of the balance.
      liabilitiesCents += Math.abs(bal)
    } else {
      liquidAssetsCents += bal
    }
  }

  const netWorthCents = liquidAssetsCents - liabilitiesCents

  return {
    orgId,
    snapshotDate: new Date(),
    netWorthCents,
    liquidAssetsCents,
    liabilitiesCents,
    breakdown: JSON.stringify(breakdown),
  }
}

/**
 * Fetches active accounts for the given org, computes a patrimony snapshot,
 * saves it to the database, and returns the saved snapshot.
 *
 * @param db - Drizzle database instance (from createDb)
 * @param orgId - Organization ID
 * @returns The saved PatrimonySnapshot row
 */
export async function computeAndSaveSnapshot(
  db: ReturnType<typeof createDb>,
  orgId: string,
) {
  // Fetch all active accounts for this org
  const activeAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))

  const snapshot = computeSnapshot(activeAccounts, orgId)

  const [saved] = await db
    .insert(patrimonySnapshots)
    .values(snapshot)
    .returning()

  return saved
}
