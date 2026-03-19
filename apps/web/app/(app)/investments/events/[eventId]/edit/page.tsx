import { notFound } from 'next/navigation'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getAssets, getPortfolioEventById } from '@/lib/investments/queries'
import { PortfolioEventEditForm } from '@/components/investments/portfolio-event-edit-form'
import { PageHeader } from '@/components/ui/page-header'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EditPortfolioEventPage({ params }: Props) {
  const { eventId } = await params
  const orgId = await getOrgId()

  const [event, accounts, assets] = await Promise.all([
    getPortfolioEventById(orgId, eventId),
    getAccounts(orgId),
    getAssets(orgId),
  ])

  if (!event) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar Evento de Portfolio"
        description="Altere os dados do evento. O saldo da conta será recalculado automaticamente."
      />

      <div className="max-w-xl">
        <PortfolioEventEditForm event={event} assets={assets} accounts={accounts} />
      </div>
    </div>
  )
}
