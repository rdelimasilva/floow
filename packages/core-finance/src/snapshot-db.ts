/**
 * DB-connected patrimony snapshot operations.
 *
 * IMPORTANT: This module imports @floow/db runtime values (postgres client).
 * It must ONLY be imported from server-side code (server actions, API routes, RSCs).
 * Never import this file from client components or include it in the package index.ts.
 *
 * Pure snapshot computation is in snapshot.ts (safe for client bundling).
 */

import { createDb, accounts, patrimonySnapshots } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { computeSnapshot } from './snapshot'

/**
 * Fetches active accounts for the given org, computes a patrimony snapshot,
 * saves it to the database, and returns the saved snapshot.
 *
 * @param db - Drizzle database instance (from createDb)
 * @param orgId - Organization ID
 * @param investmentValueCents - Optional total portfolio value in cents (default 0).
 *   The caller (refreshSnapshot action) should compute this from getPositions() before calling.
 *   Keeping this param here avoids importing apps/web code into the package.
 * @returns The saved PatrimonySnapshot row
 */
export async function computeAndSaveSnapshot(
  db: ReturnType<typeof createDb>,
  orgId: string,
  investmentValueCents: number = 0,
) {
  // Fetch all active accounts for this org
  const activeAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))

  const snapshot = computeSnapshot(activeAccounts, orgId, investmentValueCents)

  const [saved] = await db
    .insert(patrimonySnapshots)
    .values(snapshot)
    .returning()

  return saved
}
