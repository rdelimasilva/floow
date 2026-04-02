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

  const toStr = (d: unknown) => d instanceof Date ? d.toISOString() : d

  return (
    <CfoClient
      insights={insights.map((i) => ({
        ...i,
        generatedAt: toStr(i.generatedAt) as string,
        expiresAt: toStr(i.expiresAt) as string,
        dismissedAt: i.dismissedAt ? toStr(i.dismissedAt) as string : null,
        actedOnAt: i.actedOnAt ? toStr(i.actedOnAt) as string : null,
        createdAt: toStr(i.createdAt) as string,
        updatedAt: toStr(i.updatedAt) as string,
      }))}
      latestRun={latestRun ? {
        ...latestRun,
        startedAt: toStr(latestRun.startedAt) as string,
        completedAt: latestRun.completedAt ? toStr(latestRun.completedAt) as string : null,
        createdAt: toStr(latestRun.createdAt) as string,
      } : null}
    />
  )
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
        title="Consultor Financeiro"
        description="Insights diários sobre sua estratégia financeira"
      />

      <Suspense fallback={<CfoSkeleton />}>
        <CfoContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
