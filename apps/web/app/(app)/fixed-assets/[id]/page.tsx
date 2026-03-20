import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssetById, getFixedAssetTypes } from '@/lib/fixed-assets/queries'
import { estimateAssetValue, formatBRL } from '@floow/core-finance'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UpdateValueForm } from './update-value-form'
import { DeleteAssetButton } from './delete-asset-button'
import { AssetValueHistory } from '@/components/fixed-assets/asset-value-history'

export default async function FixedAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const orgId = await getOrgId()
  const [asset, types] = await Promise.all([
    getFixedAssetById(orgId, id),
    getFixedAssetTypes(orgId),
  ])

  if (!asset) notFound()

  const typeName = types.find((t) => t.id === asset.typeId)?.name ?? '—'
  const baseDate = asset.currentValueDate instanceof Date ? asset.currentValueDate : new Date(asset.currentValueDate)
  const purchaseDate = asset.purchaseDate instanceof Date ? asset.purchaseDate : new Date(asset.purchaseDate)
  const annualRate = Number(asset.annualRate)
  const estimatedValue = estimateAssetValue(asset.currentValueCents, baseDate, annualRate)

  // Generate monthly value history from purchase date to today
  const monthlyHistory: { month: string; label: string; valueCents: number }[] = []
  const now = new Date()
  const cursor = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), 1)
  while (cursor <= now) {
    const refDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) // last day of month
    const effectiveRef = refDate > now ? now : refDate
    const value = estimateAssetValue(asset.currentValueCents, baseDate, annualRate, effectiveRef)
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const label = cursor.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    monthlyHistory.push({ month: monthKey, label, valueCents: value })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/fixed-assets" className="text-sm text-gray-500 hover:text-gray-700">&larr; Ativos Imobilizados</Link>
      </div>

      <PageHeader title={asset.name} description={typeName}>
        <Button asChild variant="outline">
          <Link href={`/fixed-assets/${id}/edit`}>Editar</Link>
        </Button>
        <DeleteAssetButton assetId={id} assetName={asset.name} />
      </PageHeader>

      {/* Main info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor de Compra</p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(asset.purchaseValueCents)}</p>
          <p className="mt-1 text-xs text-gray-400">{purchaseDate.toLocaleDateString('pt-BR')}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor Atual Estimado</p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(estimatedValue)}</p>
          <p className="mt-1 text-xs text-gray-400">Baseado na taxa de {(Number(asset.annualRate) * 100).toFixed(1)}% a.a.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Valorização</p>
          <p className={`mt-2 text-xl font-bold ${estimatedValue >= asset.purchaseValueCents ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(estimatedValue - asset.purchaseValueCents)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {((estimatedValue / asset.purchaseValueCents - 1) * 100).toFixed(1)}% desde a compra
          </p>
        </Card>
      </div>

      {/* Optional fields */}
      {(asset.model || asset.address || asset.licensePlate) && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Detalhes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {asset.model && (
              <div>
                <p className="text-xs text-gray-500">Modelo</p>
                <p className="text-sm text-foreground">{asset.model}</p>
              </div>
            )}
            {asset.address && (
              <div>
                <p className="text-xs text-gray-500">Endereço</p>
                <p className="text-sm text-foreground">{asset.address}</p>
              </div>
            )}
            {asset.licensePlate && (
              <div>
                <p className="text-xs text-gray-500">Placa</p>
                <p className="text-sm text-foreground">{asset.licensePlate}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Value evolution chart + table */}
      <AssetValueHistory data={monthlyHistory} />

      {/* Update value form */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Atualizar Valor de Mercado</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-gray-400 mb-3">
            Última atualização: {baseDate.toLocaleDateString('pt-BR')} — {formatBRL(asset.currentValueCents)}
          </p>
          <UpdateValueForm assetId={id} />
        </CardContent>
      </Card>
    </div>
  )
}
