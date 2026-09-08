import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getDb, fixedAssets, fixedAssetTypes, transactions } from '@floow/db'
import { eq, and, or, isNull, desc, lt } from 'drizzle-orm'
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

export interface AcquisitionCandidate {
  id: string
  date: Date
  description: string
  amountCents: number
}

/**
 * Saídas recentes da org, para o usuário apontar qual pagou pelo bem.
 *
 * Só valor negativo: compra é dinheiro saindo. Sem `isIgnored`, porque
 * lançamento marcado como errado não comprou nada. Limitado porque a org tem
 * milhares de linhas e o Select do app tem busca (ver `components/ui/select`)
 * — carregar tudo travaria a tela para ganhar quase nada.
 */
const ACQUISITION_CANDIDATE_LIMIT = 300

export const getAcquisitionCandidates = cache(async (orgId: string): Promise<AcquisitionCandidate[]> => {
  const db = getDb()
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.isIgnored, false), lt(transactions.amountCents, 0)))
    .orderBy(desc(transactions.date))
    .limit(ACQUISITION_CANDIDATE_LIMIT)

  return rows.map((row) => ({
    ...row,
    date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
  }))
})

/**
 * O lançamento vinculado a um bem, para a tela do ativo mostrar a compra.
 * Filtra por org também aqui: o id vem de `fixed_assets`, mas a checagem é
 * barata e fecha o caminho caso um vínculo antigo aponte para fora da org.
 */
export const getAcquisitionTransaction = cache(async (orgId: string, transactionId: string | null) => {
  if (!transactionId) return null

  const db = getDb()
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId)))
    .limit(1)

  if (!row) return null

  return {
    ...row,
    date: row.date instanceof Date ? row.date : new Date(row.date as unknown as string),
  }
})

export { getOrgId }
