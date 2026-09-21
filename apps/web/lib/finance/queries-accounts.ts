import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, accounts } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { accountsTag } from '@/lib/cache-tags'

/**
 * Returns all active accounts for the given org, ordered by name.
 * Wrapped in React cache() to deduplicate within a single request.
 */
export const getAccounts = cache(async function getAccounts(orgId: string) {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
        .orderBy(accounts.name)
    },
    ['finance-accounts', orgId],
    { tags: [accountsTag(orgId)], revalidate: 300 },
  )()
})

/**
 * Returns a single account by ID, verifying org ownership.
 * Returns null if account not found or doesn't belong to the org.
 */
export const getAccountById = cache(async function getAccountById(orgId: string, accountId: string) {
  const db = getDb()
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId), eq(accounts.isActive, true)))
    .limit(1)

  return account ?? null
})
