import { redirect } from 'next/navigation'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets } from '@/lib/investments/queries'
import { AssetEditForm } from '@/components/investments/asset-edit-form'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ assetId: string }>
}

export default async function EditAssetPage({ params }: Props) {
  const { assetId } = await params
  const orgId = await getOrgId()
  const assets = await getAssets(orgId)
  const asset = assets.find((a) => a.id === assetId)

  if (!asset) redirect('/investments')

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Editar Ativo" />
      <AssetEditForm asset={asset} />
    </div>
  )
}
