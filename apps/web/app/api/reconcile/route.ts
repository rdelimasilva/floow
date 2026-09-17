import { NextResponse } from 'next/server'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { reconcileRecurringBalances } from '@/lib/finance/actions'

/**
 * POST /api/reconcile
 *
 * Reconciles recurring transaction balances in the background.
 * Called client-side after page load so it never blocks page rendering.
 * Auth-protected: requires a valid session cookie.
 */
export async function POST() {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await reconcileRecurringBalances()
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Reconciliation errors are non-fatal — log but don't surface to user
    console.error('[reconcile] Failed:', err)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
