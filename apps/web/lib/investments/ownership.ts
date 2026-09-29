import { and, eq } from 'drizzle-orm'
import { accounts, assets, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

/**
 * Verifies that an asset belongs to the given org.
 * Throws if the asset does not exist or belongs to a different org.
 */
export async function assertAssetOwnership(db: Db, assetId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw new Error(`Asset ${assetId} not found or does not belong to this organization`)
  }
}

/**
 * Verifies that an account belongs to the given org.
 * Throws if the account does not exist or belongs to a different org.
 */
export async function assertAccountOwnership(db: Db, accountId: string, orgId: string): Promise<void> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.orgId, orgId)))
    .limit(1)

  if (!row) {
    throw new Error(`Account ${accountId} not found or does not belong to this organization`)
  }
}
