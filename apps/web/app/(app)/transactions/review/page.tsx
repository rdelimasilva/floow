import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { CounterpartyQueue } from '@/components/openfinance/counterparty-queue'
import { PageHeader } from '@/components/ui/page-header'

export default async function ReviewPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revisão de contrapartes"
        description="Lançamentos do Open Finance que o floow ainda não sabe classificar sozinho."
      />
      <Suspense fallback={null}>
        <CounterpartyQueue orgId={orgId} mode="page" />
      </Suspense>
    </div>
  )
}
