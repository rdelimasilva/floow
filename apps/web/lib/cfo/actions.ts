'use server'

import { getDb, cfoInsights } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { cfoInsightsTag, invalidateTag } from '../cache-tags'

export async function dismissInsight(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ dismissedAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  invalidateTag(cfoInsightsTag(orgId))
}

export async function markInsightActedOn(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ actedOnAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  invalidateTag(cfoInsightsTag(orgId))
}
