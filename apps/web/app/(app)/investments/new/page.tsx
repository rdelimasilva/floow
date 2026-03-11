import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getAssets } from '@/lib/investments/queries'
import { AssetForm } from '@/components/investments/asset-form'
import { PortfolioEventForm } from '@/components/investments/portfolio-event-form'

export default async function InvestmentsNewPage() {
  const orgId = await getOrgId()

  const [accounts, assets] = await Promise.all([
    getAccounts(orgId),
    getAssets(orgId),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Novo Ativo / Evento</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cadastre um novo ativo na sua carteira ou registre um evento de portfolio.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Asset registration form */}
        <AssetForm />

        {/* Portfolio event form */}
        <PortfolioEventForm assets={assets} accounts={accounts} />
      </div>
    </div>
  )
}
