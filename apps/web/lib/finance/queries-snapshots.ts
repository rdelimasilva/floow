import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, patrimonySnapshots } from '@floow/db'
import { eq, desc } from 'drizzle-orm'
import { snapshotsTag } from '@/lib/cache-tags'

/**
 * Returns the most recent patrimony snapshot for the given org, or null if none exists.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getLatestSnapshot = cache(async function getLatestSnapshot(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      const results = await db
        .select()
        .from(patrimonySnapshots)
        .where(eq(patrimonySnapshots.orgId, orgId))
        .orderBy(desc(patrimonySnapshots.snapshotDate))
        .limit(1)

      return results[0] ?? null
    },
    ['finance-latest-snapshot', orgId],
    { tags: [snapshotsTag(orgId)], revalidate: 300 },
  )()
})
