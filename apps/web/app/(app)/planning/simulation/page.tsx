import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getPlanningPortfolioSummary, getRetirementPlan, getSimulationScenarios } from '@/lib/planning/queries'
import { SimulationForm } from '@/components/planning/simulation-form'

// -- Async sub-component for Suspense streaming --------------------------------

async function SimulationContent({ orgId }: { orgId: string }) {
  const [retirementPlan, summary, scenarios] = await Promise.all([
    getRetirementPlan(orgId),
    getPlanningPortfolioSummary(orgId),
    getSimulationScenarios(orgId),
  ])

  return (
    <SimulationForm
      defaultValues={retirementPlan ? {
        currentAge: retirementPlan.currentAge,
        retirementAge: retirementPlan.retirementAge,
        lifeExpectancy: retirementPlan.lifeExpectancy,
        monthlyContributionCents: retirementPlan.monthlyContributionCents,
        desiredMonthlyIncomeCents: retirementPlan.desiredMonthlyIncomeCents,
        inflationRate: String(retirementPlan.inflationRate),
        conservativeReturnRate: retirementPlan.conservativeReturnRate != null
          ? String(retirementPlan.conservativeReturnRate)
          : null,
        baseReturnRate: retirementPlan.baseReturnRate != null
          ? String(retirementPlan.baseReturnRate)
          : null,
        aggressiveReturnRate: retirementPlan.aggressiveReturnRate != null
          ? String(retirementPlan.aggressiveReturnRate)
          : null,
        contributionGrowthRate: retirementPlan.contributionGrowthRate != null
          ? String(retirementPlan.contributionGrowthRate)
          : null,
      } : null}
      currentPortfolioCents={summary.currentPortfolioCents}
      currentPassiveIncomeCents={summary.currentPassiveIncomeCents}
      savedScenarios={scenarios}
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
      <PageHeader
        title="Simulação de Aposentadoria"
        description="Veja como seu patrimônio evolui em 3 cenários e descubra quando atingirá a independência financeira."
      />

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
