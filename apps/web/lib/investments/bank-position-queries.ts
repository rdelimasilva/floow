import { and, desc, eq } from 'drizzle-orm'
import { assetBankPositions } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'

/** Bruto, líquido e impostos que o banco informou na última data de referência. */
export async function getLatestBankPosition(orgId: string, assetId: string) {
  return withUserDb(async (db) => {
    const [row] = await db
      .select({
        referenceDate: assetBankPositions.referenceDate,
        grossCents: assetBankPositions.grossCents,
        netCents: assetBankPositions.netCents,
        incomeTaxCents: assetBankPositions.incomeTaxCents,
        iofCents: assetBankPositions.iofCents,
      })
      .from(assetBankPositions)
      .where(and(eq(assetBankPositions.orgId, orgId), eq(assetBankPositions.assetId, assetId)))
      .orderBy(desc(assetBankPositions.referenceDate))
      .limit(1)
    return row ?? null
  })
}
