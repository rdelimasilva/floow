import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { getAssets } from '@/lib/investments/queries'
import { AssetForm } from '@/components/investments/asset-form'
import { PortfolioEventForm } from '@/components/investments/portfolio-event-form'
import { PageHeader } from '@/components/ui/page-header'

export default async function InvestmentsNewPage() {
  const orgId = await getOrgId()

  const [accounts, assets] = await Promise.all([
    getAccounts(orgId),
    getAssets(orgId),
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Novo Ativo / Evento"
        description="Cadastre um novo ativo na sua carteira ou registre um evento de portfolio."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Asset registration form */}
        <AssetForm />

        {/* Portfolio event form */}
        <PortfolioEventForm assets={assets} accounts={accounts} />
      </div>
    </div>
  )
}
