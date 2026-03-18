import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { getRetirementPlan } from '@/lib/planning/queries'
import { getPositions, getIncomeEvents } from '@/lib/investments/queries'
import { estimateMonthlyIncome } from '@floow/core-finance'
import { SimulationForm } from '@/components/planning/simulation-form'

// -- Async sub-component for Suspense streaming --------------------------------

async function SimulationContent({ orgId }: { orgId: string }) {
  const [retirementPlan, positions, incomeEvents] = await Promise.all([
    getRetirementPlan(orgId),
    getPositions(orgId),
    getIncomeEvents(orgId),
  ])

  const currentPortfolioCents = positions.reduce(
    (sum, p) => sum + p.currentValueCents,
    0
  )

  const currentPassiveIncomeCents = estimateMonthlyIncome(
    incomeEvents.map((e) => ({
      eventType: e.eventType,
      totalCents: e.totalCents,
      eventDate: e.eventDate,
    }))
  )

  return (
    <SimulationForm
      defaultValues={retirementPlan}
      currentPortfolioCents={currentPortfolioCents}
      currentPassiveIncomeCents={currentPassiveIncomeCents}
    />
  )
}

// -- Page ----------------------------------------------------------------------

/**
 * SimulationPage — retirement simulation with 3-scenario projection chart.
 * RSC with Suspense streaming — data fetched in SimulationContent async sub-component.
 */
export default async function SimulationPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Simulacao de Aposentadoria
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Veja como seu patrimonio evolui em 3 cenarios e descubra quando atingira a independencia financeira.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-96 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          </div>
        }
      >
        <SimulationContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
