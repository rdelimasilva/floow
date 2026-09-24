import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatBRL } from '@floow/core-finance'
import { getOrgId } from '@/lib/finance/queries'
import { getAssets, getPortfolioEvents } from '@/lib/investments/queries'
import { getLatestBankPosition } from '@/lib/investments/bank-position-queries'
import { ASSET_CLASS_LABEL, EVENT_TYPE_LABEL, assetDisplayName } from '@/lib/investments/asset-labels'
import { AssetEventList } from '@/components/investments/asset-event-list'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ assetId: string }>
}

/** 'YYYY-MM-DD' -> 'dd/MM/yyyy', sem passar por Date (evita o fuso mudar o dia). */
function formatarDataReferencia(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
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

  const isFromBank = asset.source === 'openfinance'
  const bankPosition = isFromBank ? await getLatestBankPosition(orgId, assetId) : null

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
        {!isFromBank && (
          <Link
            href={`/investments/${assetId}/edit`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Editar Ativo
          </Link>
        )}
        <Link
          href="/investments"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Voltar
        </Link>
      </PageHeader>

      {/* Posição no banco */}
      {isFromBank && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Posição no banco</h2>
          {bankPosition ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-500">Data de referência</p>
                <p className="text-sm font-medium text-gray-900">
                  {formatarDataReferencia(bankPosition.referenceDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Bruto</p>
                <p className="text-sm font-medium text-gray-900">
                  {bankPosition.grossCents != null ? formatBRL(bankPosition.grossCents) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Líquido</p>
                <p className="text-sm font-medium text-gray-900">
                  {bankPosition.netCents != null ? formatBRL(bankPosition.netCents) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">IR</p>
                <p className="text-sm font-medium text-gray-900">
                  {bankPosition.incomeTaxCents != null ? formatBRL(bankPosition.incomeTaxCents) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">IOF</p>
                <p className="text-sm font-medium text-gray-900">
                  {bankPosition.iofCents != null ? formatBRL(bankPosition.iofCents) : '—'}
                </p>
              </div>
              {asset.dueDate && (
                <div>
                  <p className="text-xs text-gray-500">Vencimento</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatarDataReferencia(asset.dueDate)}
                  </p>
                </div>
              )}
              {(asset.indexer || asset.assetSubtype) && (
                <div>
                  <p className="text-xs text-gray-500">Remuneração</p>
                  <p className="text-sm font-medium text-gray-900">
                    {[asset.assetSubtype, asset.indexer].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">O banco ainda não informou uma posição para este ativo.</p>
          )}
        </div>
      )}

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
          <AssetEventList events={enrichedEvents} readOnly={isFromBank} />
        )}
      </div>
    </div>
  )
}
