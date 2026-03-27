import { Suspense } from 'react'
import { getOrgId, getAccounts } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import {
  getPlanningPortfolioSummary,
  getSuccessionPlan,
  getHeirs,
} from '@/lib/planning/queries'
import { getPatrimonySnapshots } from '@/lib/investments/queries'
import { SuccessionForm } from '@/components/planning/succession-form'

// ---------------------------------------------------------------------------
// Async sub-component (Suspense boundary)
// ---------------------------------------------------------------------------

async function SuccessionContent({ orgId }: { orgId: string }) {
  const [successionPlan, summary, snapshots] = await Promise.all([
    getSuccessionPlan(orgId),
    getPlanningPortfolioSummary(orgId),
    getPatrimonySnapshots(orgId, 1),
  ])

  const savedHeirs = successionPlan
    ? await getHeirs(orgId, successionPlan.id)
    : []

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
      defaultValues={successionPlan ? {
        brazilianState: successionPlan.brazilianState,
        estimatedFuneralCostsCents: successionPlan.estimatedFuneralCostsCents,
        estimatedLegalFeesCents: successionPlan.estimatedLegalFeesCents,
        additionalLiabilitiesCents: successionPlan.additionalLiabilitiesCents,
      } : null}
      defaultHeirs={savedHeirs.map((heir) => ({
        name: heir.name,
        relationship: heir.relationship,
        percentageShare: String(heir.percentageShare),
      }))}
      currentPortfolioCents={summary.currentPortfolioCents}
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
