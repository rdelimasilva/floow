import { notFound } from 'next/navigation'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getAssets, getPortfolioEventById } from '@/lib/investments/queries'
import { PortfolioEventEditForm } from '@/components/investments/portfolio-event-edit-form'

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Editar Evento de Portfolio
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Altere os dados do evento. O saldo da conta será recalculado automaticamente.
        </p>
      </div>

      <div className="max-w-xl">
        <PortfolioEventEditForm event={event} assets={assets} accounts={accounts} />
      </div>
    </div>
  )
}
