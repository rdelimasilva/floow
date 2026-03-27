import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, fixedAssets, fixedAssetTypes } from '@floow/db'
import { eq, and, or, isNull, desc } from 'drizzle-orm'
import { getOrgId } from '@/lib/finance/queries'
import { fixedAssetsTag, fixedAssetTypesTag } from '@/lib/cache-tags'

export const getFixedAssetTypes = cache(async (orgId: string) => {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(fixedAssetTypes)
        .where(or(eq(fixedAssetTypes.orgId, orgId), isNull(fixedAssetTypes.orgId)))
        .orderBy(fixedAssetTypes.name)
    },
    ['fixed-asset-types', orgId],
    { tags: [fixedAssetTypesTag(orgId)], revalidate: 600 },
  )()
})

export const getFixedAssets = cache(async (orgId: string) => {
  return unstable_cache(
    async () => {
      const db = getDb()
      return db
        .select()
        .from(fixedAssets)
        .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.isActive, true)))
        .orderBy(desc(fixedAssets.createdAt))
    },
    ['fixed-assets', orgId],
    { tags: [fixedAssetsTag(orgId)], revalidate: 300 },
  )()
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
