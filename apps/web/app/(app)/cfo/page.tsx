import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId } from '@/lib/finance/queries'
import { getActiveInsights, getLatestRun } from '@/lib/cfo/queries'
import { CfoClient } from './client'

async function CfoContent({ orgId }: { orgId: string }) {
  const [insights, latestRun] = await Promise.all([
    getActiveInsights(orgId),
    getLatestRun(orgId),
  ])

  return <CfoClient insights={insights} latestRun={latestRun} />
}

function CfoSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  )
}

export default async function CfoPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="CFO Pessoal"
        description="Insights diários sobre sua estratégia financeira"
      />

      <Suspense fallback={<CfoSkeleton />}>
        <CfoContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
