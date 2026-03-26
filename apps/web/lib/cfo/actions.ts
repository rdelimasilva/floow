'use server'

import { revalidateTag } from 'next/cache'
import { getDb, cfoInsights } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { cfoInsightsTag } from '../cache-tags'

export async function dismissInsight(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ dismissedAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  revalidateTag(cfoInsightsTag(orgId))
}

export async function markInsightActedOn(insightId: string) {
  const orgId = await getOrgId()
  const db = getDb()

  await db
    .update(cfoInsights)
    .set({ actedOnAt: new Date() })
    .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))

  revalidateTag(cfoInsightsTag(orgId))
}
