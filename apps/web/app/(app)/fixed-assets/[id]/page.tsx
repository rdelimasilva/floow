import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getFixedAssetById, getFixedAssetTypes, getLinkedTransaction, getSaleCandidates } from '@/lib/fixed-assets/queries'
import { estimateAssetValue, formatBRL } from '@floow/core-finance'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UpdateValueForm } from './update-value-form'
import { DeleteAssetButton } from './delete-asset-button'
import { SellAssetForm } from './sell-asset-form'
import dynamic from 'next/dynamic'
import { formatarDia } from '@/lib/formatar-dia'
import { formatarNumero } from '@/lib/formatar-numero'

const AssetValueHistory = dynamic(() => import('@/components/fixed-assets/asset-value-history').then(m => ({ default: m.AssetValueHistory })), {
  loading: () => <div className="min-h-[200px] animate-pulse rounded-xl bg-gray-100" />,
})

export default async function FixedAssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const orgId = await getOrgId()
  const [asset, types] = await Promise.all([
    getFixedAssetById(orgId, id),
    getFixedAssetTypes(orgId),
  ])

  if (!asset) notFound()

  // O lançamento que pagou pelo bem. Existe para dar rastreabilidade da
  // aquisição sem fazer do bem uma conta — ver migration 00040.
  const vendido = asset.soldAt != null
  const [acquisition, sale, saleCandidates] = await Promise.all([
    getLinkedTransaction(orgId, asset.acquisitionTransactionId),
    getLinkedTransaction(orgId, asset.saleTransactionId),
    vendido ? Promise.resolve([]) : getSaleCandidates(orgId),
  ])

  const typeName = types.find((t) => t.id === asset.typeId)?.name ?? '—'
  const baseDate = asset.currentValueDate instanceof Date ? asset.currentValueDate : new Date(asset.currentValueDate)
  const purchaseDate = asset.purchaseDate instanceof Date ? asset.purchaseDate : new Date(asset.purchaseDate)
  const annualRate = Number(asset.annualRate)
  // Vendido, o valor que importa é o da venda, não a estimativa de hoje.
  const estimatedValue = vendido && asset.saleValueCents != null
    ? asset.saleValueCents
    : estimateAssetValue(asset.currentValueCents, baseDate, annualRate)

  // Generate monthly value history from purchase date to today
  const monthlyHistory: { month: string; label: string; valueCents: number }[] = []
  // Vendido, a curva para no mês da venda.
  const now = vendido ? new Date(asset.soldAt!) : new Date()
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
        <Link href="/fixed-assets" className="text-sm text-gray-500 hover:text-gray-700">&larr; Bens</Link>
      </div>

      <PageHeader title={asset.name} description={vendido ? `${typeName} · vendido em ${formatarDia(asset.soldAt!)}` : typeName}>
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
          <p className="mt-1 text-xs text-gray-500">{formatarDia(purchaseDate)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{vendido ? 'Valor de Venda' : 'Valor Atual Estimado'}</p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(estimatedValue)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {vendido ? formatarDia(asset.soldAt!) : `Baseado na taxa de ${formatarNumero(Number(asset.annualRate) * 100, 1)}% a.a.`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{vendido ? 'Resultado da Venda' : 'Valorização'}</p>
          <p className={`mt-2 text-xl font-bold ${estimatedValue >= asset.purchaseValueCents ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(estimatedValue - asset.purchaseValueCents)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {formatarNumero((estimatedValue / asset.purchaseValueCents - 1) * 100, 1)}% desde a compra
          </p>
        </Card>
      </div>

      {acquisition && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Aquisição</CardTitle></CardHeader>
          <CardContent>
            <Link
              href={`/transactions?q=${encodeURIComponent(acquisition.description)}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm hover:underline"
            >
              <span className="text-gray-500">{formatarDia(acquisition.date)}</span>
              <span className="text-foreground">{acquisition.description}</span>
              <span className="font-medium text-foreground">{formatBRL(acquisition.amountCents)}</span>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Este lançamento pagou pelo bem. O patrimônio conta o valor do ativo, com a
              depreciação — não o saldo de uma conta.
            </p>
          </CardContent>
        </Card>
      )}

      {sale && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Venda</CardTitle></CardHeader>
          <CardContent>
            <Link
              href={`/transactions?q=${encodeURIComponent(sale.description)}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm hover:underline"
            >
              <span className="text-gray-500">{formatarDia(sale.date)}</span>
              <span className="text-foreground">{sale.description}</span>
              <span className="font-medium text-foreground">{formatBRL(sale.amountCents)}</span>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Este lançamento recebeu o dinheiro da venda. O bem não conta mais no patrimônio.
            </p>
          </CardContent>
        </Card>
      )}

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

      {!vendido && (
        <>
          {/* Update value form */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Atualizar Valor de Mercado</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">
                Última atualização: {formatarDia(baseDate)} — {formatBRL(asset.currentValueCents)}
              </p>
              <UpdateValueForm assetId={id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Vendeu este bem?</CardTitle></CardHeader>
            <CardContent>
              <SellAssetForm assetId={id} assetName={asset.name} candidates={saleCandidates} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
