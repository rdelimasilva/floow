import type { InsightCategory } from '@floow/core-finance'
import { getAppUrl } from '@/lib/app-url'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Fire-and-forget CFO analysis trigger.
 * Called from server actions after mutations.
 */
export function triggerCfoAnalysis(
  orgId: string,
  event: string,
  analyzers: InsightCategory[],
) {
  const baseUrl = getAppUrl()

  fetch(`${baseUrl}/api/cfo/run-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ orgId, event, analyzers }),
  }).catch((err) => {
    console.error(`[CFO] Event trigger failed for org=${orgId} event=${event}:`, err)
  })
}
