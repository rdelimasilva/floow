import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssetTypes, getAcquisitionCandidates } from '@/lib/fixed-assets/queries'
import { AssetForm } from './asset-form'

export default async function NewFixedAssetPage() {
  const orgId = await getOrgId()
  const [types, candidates] = await Promise.all([
    getFixedAssetTypes(orgId),
    getAcquisitionCandidates(orgId),
  ])

  return (
    <AssetForm
      types={types.map((t) => ({ id: t.id, name: t.name }))}
      candidates={candidates}
    />
  )
}
