import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getWithdrawalStrategy, getRetirementPlan } from '@/lib/planning/queries'
import { getPositions } from '@/lib/investments/queries'
import { WithdrawalForm } from '@/components/planning/withdrawal-form'

// ---------------------------------------------------------------------------
// Async sub-component (Suspense boundary)
// ---------------------------------------------------------------------------

async function WithdrawalContent({ orgId }: { orgId: string }) {
  const [withdrawalStrategy, retirementPlan, positions] = await Promise.all([
    getWithdrawalStrategy(orgId),
    getRetirementPlan(orgId),
    getPositions(orgId),
  ])

  const currentPortfolioCents = positions.reduce((sum, p) => sum + p.currentValueCents, 0)
  const retirementAge = retirementPlan?.retirementAge ?? 65
  const lifeExpectancy = retirementPlan?.lifeExpectancy ?? 85

  return (
    <WithdrawalForm
      defaultValues={withdrawalStrategy}
      currentPortfolioCents={currentPortfolioCents}
      retirementAge={retirementAge}
      lifeExpectancy={lifeExpectancy}
    />
  )
}

// ---------------------------------------------------------------------------
// Page — RSC with Suspense streaming
// ---------------------------------------------------------------------------

export default async function WithdrawalPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estratégia de Retirada"
        description="Defina como você vai consumir seu patrimônio na aposentadoria"
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          </div>
        }
      >
        <WithdrawalContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
