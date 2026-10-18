import { notFound } from 'next/navigation'
import { ehIdDeRota } from '@/lib/investments/id-de-rota'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets } from '@/lib/investments/queries'
import { AssetEditForm } from '@/components/investments/asset-edit-form'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ assetId: string }>
}

export default async function EditAssetPage({ params }: Props) {
  const { assetId } = await params
  if (!ehIdDeRota(assetId)) notFound()
  const orgId = await getOrgId()
  const assets = await getAssets(orgId)
  const asset = assets.find((a) => a.id === assetId)

  if (!asset) notFound()

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Editar Ativo" />
      <AssetEditForm asset={{
        ...asset,
        createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
        updatedAt: asset.updatedAt instanceof Date ? asset.updatedAt.toISOString() : asset.updatedAt,
      }} />
    </div>
  )
}
