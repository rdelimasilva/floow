import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssetTypes } from '@/lib/fixed-assets/queries'
import { AssetForm } from './asset-form'

export default async function NewFixedAssetPage() {
  const orgId = await getOrgId()
  const types = await getFixedAssetTypes(orgId)

  return <AssetForm types={types.map((t) => ({ id: t.id, name: t.name }))} />
}
