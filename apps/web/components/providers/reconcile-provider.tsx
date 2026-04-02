'use client'

import { useEffect } from 'react'

/**
 * ReconcileProvider — fires a background reconciliation request after mount.
 *
 * This runs reconcileRecurringBalances() in the background via POST /api/reconcile
 * so it never blocks page rendering or navigation. Errors are silently swallowed
 * (non-fatal: if it fails, the next page load will retry).
 */
export function ReconcileProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const throttleKey = 'floow.reconcile.lastRunAt'
    const now = Date.now()
    const lastRunAt = Number(localStorage.getItem(throttleKey) ?? '0')

    // Reconciliation is maintenance work. Run it at most once per day per browser.
    if (now - lastRunAt < 24 * 60 * 60 * 1000) {
      return
    }

    localStorage.setItem(throttleKey, String(now))

    // Fire-and-forget: no await, no error surfacing to user
    fetch('/api/reconcile', { method: 'POST' }).catch(() => {
      // Silently ignore — reconciliation will be retried on next page load
      localStorage.removeItem(throttleKey)
    })
  }, [])

  return <>{children}</>
}
