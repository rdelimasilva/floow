'use server'

import { getPriceHistory as _getPriceHistory } from './queries'
import type { PriceHistoryEntry } from './queries'

/**
 * Server action wrapper for getPriceHistory — callable from client components.
 */
export async function getPriceHistory(orgId: string, assetId: string): Promise<PriceHistoryEntry[]> {
  return _getPriceHistory(orgId, assetId)
}
