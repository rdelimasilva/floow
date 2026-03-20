import { notFound } from 'next/navigation'
import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssetById, getFixedAssetTypes } from '@/lib/fixed-assets/queries'
import { EditAssetForm } from './edit-asset-form'

export default async function EditFixedAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const orgId = await getOrgId()
  const [asset, types] = await Promise.all([
    getFixedAssetById(orgId, id),
    getFixedAssetTypes(orgId),
  ])

  if (!asset) notFound()

  return (
    <EditAssetForm
      asset={{
        id: asset.id,
        name: asset.name,
        typeId: asset.typeId,
        purchaseValueCents: asset.purchaseValueCents,
        purchaseDate: asset.purchaseDate instanceof Date
          ? asset.purchaseDate.toISOString().split('T')[0]
          : new Date(asset.purchaseDate).toISOString().split('T')[0],
        annualRate: Number(asset.annualRate),
        address: asset.address ?? '',
        licensePlate: asset.licensePlate ?? '',
        model: asset.model ?? '',
      }}
      types={types.map((t) => ({ id: t.id, name: t.name }))}
    />
  )
}
