import { cache } from 'react'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { eq, and, or, isNull, desc } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'

export const getFixedAssetTypes = cache(async (orgId: string) => {
  const db = getDb()
  return db
    .select()
    .from(fixedAssetTypes)
    .where(or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId)))
    .orderBy(fixedAssetTypes.name)
})

export const getFixedAssets = cache(async (orgId: string) => {
  const db = getDb()
  return db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.isActive, true)))
    .orderBy(desc(fixedAssets.createdAt))
})

export const getFixedAssetById = cache(async (orgId: string, id: string) => {
  const db = getDb()
  const [asset] = await db
    .select()
    .from(fixedAssets)
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.orgId, orgId)))
    .limit(1)
  return asset ?? null
})

export { getOrgId }
