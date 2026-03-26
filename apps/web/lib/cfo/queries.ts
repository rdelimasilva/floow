import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, cfoInsights, cfoRuns } from '@floow/db'
import { eq, and, isNull, gt, desc, sql } from 'drizzle-orm'
import { cfoInsightsTag } from '../cache-tags'

const SEVERITY_ORDER = sql`CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 WHEN 'positive' THEN 3 END`

/** Active (non-dismissed, non-expired) insights for an org, ordered by severity priority. */
export const getActiveInsights = cache(function getActiveInsights(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
          )
        )
        .orderBy(SEVERITY_ORDER, desc(cfoInsights.generatedAt))
    },
    [`cfo-insights-active-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Top N insights for dashboard strip. */
export const getTopInsights = cache(function getTopInsights(orgId: string, limit = 3) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
          )
        )
        .orderBy(SEVERITY_ORDER, desc(cfoInsights.generatedAt))
        .limit(limit)
    },
    [`cfo-insights-top-${orgId}-${limit}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Latest run for an org. */
export const getLatestRun = cache(function getLatestRun(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const [run] = await db
        .select()
        .from(cfoRuns)
        .where(eq(cfoRuns.orgId, orgId))
        .orderBy(desc(cfoRuns.startedAt))
        .limit(1)
      return run ?? null
    },
    [`cfo-runs-latest-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})

/** Count of active critical + warning insights (for sidebar badge). */
export const getInsightBadgeCount = cache(function getInsightBadgeCount(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(cfoInsights)
        .where(
          and(
            eq(cfoInsights.orgId, orgId),
            isNull(cfoInsights.dismissedAt),
            gt(cfoInsights.expiresAt, sql`now()`),
            sql`severity IN ('critical', 'warning')`,
          )
        )
      return Number(row.count)
    },
    [`cfo-badge-${orgId}`],
    { tags: [cfoInsightsTag(orgId)], revalidate: 300 },
  )()
})
