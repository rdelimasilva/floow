import { notFound } from 'next/navigation'
import { comConta } from '@/lib/investments/conta-na-url'
import { ehIdDeRota } from '@/lib/investments/id-de-rota'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getAssets, getPortfolioEventById } from '@/lib/investments/queries'
import { PortfolioEventEditForm } from '@/components/investments/portfolio-event-edit-form'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ voltar?: string; accountId?: string }>
}

export default async function EditPortfolioEventPage({ params, searchParams }: Props) {
  const { eventId } = await params
  if (!ehIdDeRota(eventId)) notFound()
  const orgId = await getOrgId()

  const [event, accounts, assets] = await Promise.all([
    getPortfolioEventById(orgId, eventId),
    getAccounts(orgId),
    getAssets(orgId),
  ])

  if (!event) notFound()
  // Aberto pelo detalhe do ativo, volta para ele; senão, para Renda Passiva.
  const { voltar, accountId } = await searchParams
  const voltarPara = comConta(
    voltar === 'ativo' && event.assetId ? `/investments/${event.assetId}` : '/investments/income',
    accountId,
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar Evento da Carteira"
        description="Altere os dados do evento. O saldo da conta será recalculado automaticamente."
      />

      <div className="max-w-xl">
        <PortfolioEventEditForm
          event={{
            ...event,
            eventDate: event.eventDate instanceof Date ? event.eventDate.toISOString() : event.eventDate,
          }}
          assets={assets}
          accounts={accounts}
          voltarPara={voltarPara}
        />
      </div>
    </div>
  )
}
