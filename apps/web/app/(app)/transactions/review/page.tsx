import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { CounterpartyQueue } from '@/components/openfinance/counterparty-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReviewPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Classificar lançamentos"
        description="Lançamentos que vieram do banco e o floow ainda não sabe classificar sozinho. Você decide uma vez e vale para os próximos."
      />
      <Suspense fallback={null}>
        <CounterpartyQueue orgId={orgId} mode="page" />
      </Suspense>
    </div>
  )
}
