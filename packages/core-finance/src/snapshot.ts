/**
 * Patrimony snapshot computation — pure function only.
 *
 * computeSnapshot: takes Account[] + orgId, returns NewPatrimonySnapshot (no DB I/O).
 * This module is safe for client-side bundling (no @floow/db runtime imports).
 *
 * DB-connected operations are in snapshot-db.ts, which is imported only by
 * server-side code (server actions, API routes).
 */

import type { Account, NewPatrimonySnapshot } from '@floow/db'

/**
 * Pure function: computes a patrimony snapshot from an array of Account objects.
 *
 * Rules:
 *  - credit_card type accounts: balance (typically negative) → liability (absolute value)
 *  - All other account types: balance → liquid assets
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
