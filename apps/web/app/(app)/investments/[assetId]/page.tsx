import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets, getPortfolioEvents } from '@/lib/investments/queries'
import { ASSET_CLASS_LABEL, EVENT_TYPE_LABEL, assetDisplayName } from '@/lib/investments/asset-labels'
import { AssetEventList } from '@/components/investments/asset-event-list'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ assetId: string }>
}

export default async function AssetDetailPage({ params }: Props) {
  const { assetId } = await params
  const orgId = await getOrgId()

  const [allAssets, events] = await Promise.all([
    getAssets(orgId),
    getPortfolioEvents(orgId, assetId),
  ])

  const asset = allAssets.find((a) => a.id === assetId)
  if (!asset) redirect('/investments')

  const enrichedEvents = events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    eventTypeLabel: EVENT_TYPE_LABEL[e.eventType as keyof typeof EVENT_TYPE_LABEL] ?? e.eventType,
    eventDate: e.eventDate instanceof Date ? e.eventDate.toISOString() : String(e.eventDate),
    quantity: e.quantity,
    priceCents: e.priceCents,
    totalCents: e.totalCents,
    splitRatio: e.splitRatio ? String(e.splitRatio) : null,
    notes: e.notes,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={asset.ticker ? `${assetDisplayName(asset)} — ${asset.name}` : assetDisplayName(asset)}
        description={`${ASSET_CLASS_LABEL[asset.assetClass]} · ${asset.currency}${asset.notes ? ` · ${asset.notes}` : ''}`}
      >
        <Link
          href={`/investments/${assetId}/edit`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Editar Ativo
        </Link>
        <Link
          href="/investments"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Voltar
        </Link>
      </PageHeader>

      {/* Events */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Eventos ({enrichedEvents.length})
          </h2>
        </div>

        {enrichedEvents.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum evento registrado para este ativo.</p>
        ) : (
          <AssetEventList events={enrichedEvents} />
        )}
      </div>
    </div>
  )
}
