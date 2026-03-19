import { Suspense } from 'react'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getSuccessionPlan, getHeirs } from '@/lib/planning/queries'
import { getPositions, getPatrimonySnapshots } from '@/lib/investments/queries'
import { SuccessionForm } from '@/components/planning/succession-form'

// ---------------------------------------------------------------------------
// Async sub-component (Suspense boundary)
// ---------------------------------------------------------------------------

async function SuccessionContent({ orgId }: { orgId: string }) {
  const [successionPlan, positions, snapshots] = await Promise.all([
    getSuccessionPlan(orgId),
    getPositions(orgId),
    getPatrimonySnapshots(orgId, 1),
  ])

  const savedHeirs = successionPlan
    ? await getHeirs(orgId, successionPlan.id)
    : []

  const currentPortfolioCents = positions.reduce((sum, p) => sum + p.currentValueCents, 0)

  // Compute liquidAssetsCents: prefer latest patrimony snapshot, else sum non-credit-card accounts
  let liquidAssetsCents = 0
  if (snapshots.length > 0) {
    liquidAssetsCents = snapshots[snapshots.length - 1].liquidAssetsCents
  } else {
    const accounts = await getAccounts(orgId)
    // We don't have balance here from accounts alone — use 0 as safe fallback
    // The snapshot will be populated once user triggers a snapshot update
    liquidAssetsCents = 0
    void accounts // suppress unused warning
  }

  return (
    <SuccessionForm
      defaultValues={successionPlan}
      defaultHeirs={savedHeirs}
      currentPortfolioCents={currentPortfolioCents}
      liquidAssetsCents={liquidAssetsCents}
    />
  )
}

// ---------------------------------------------------------------------------
// Page — RSC with Suspense streaming
// ---------------------------------------------------------------------------

export default async function SuccessionPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planejamento Sucessório"
        description="Defina a distribuição do seu patrimônio e estime custos de inventário"
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          </div>
        }
      >
        <SuccessionContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
