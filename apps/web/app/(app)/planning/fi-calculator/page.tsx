import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getPlanningPortfolioSummary, getRetirementPlan } from '@/lib/planning/queries'
import { FICalculatorForm } from '@/components/planning/fi-calculator-form'

// -- Async sub-component for Suspense streaming --------------------------------

async function FIContent({ orgId }: { orgId: string }) {
  const [retirementPlan, summary] = await Promise.all([
    getRetirementPlan(orgId),
    getPlanningPortfolioSummary(orgId),
  ])

  return (
    <FICalculatorForm
      defaultValues={retirementPlan ? {
        desiredMonthlyIncomeCents: retirementPlan.desiredMonthlyIncomeCents,
        monthlyContributionCents: retirementPlan.monthlyContributionCents,
        baseReturnRate: retirementPlan.baseReturnRate != null
          ? String(retirementPlan.baseReturnRate)
          : null,
        currentAge: retirementPlan.currentAge,
      } : null}
      currentPortfolioCents={summary.currentPortfolioCents}
      currentPassiveIncomeCents={summary.currentPassiveIncomeCents}
    />
  )
}

// -- Page ----------------------------------------------------------------------

/**
 * FICalculatorPage — financial independence number, date, and progress.
 * RSC with Suspense streaming — data fetched in FIContent async sub-component.
 */
export default async function FICalculatorPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calculadora de Independencia Financeira"
        description="Descubra quanto voce precisa acumular para viver de renda e quando vai atingir esse numero."
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          </div>
        }
      >
        <FIContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
