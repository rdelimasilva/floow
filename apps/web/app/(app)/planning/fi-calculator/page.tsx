import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getRetirementPlan } from '@/lib/planning/queries'
import { getPositions, getIncomeEvents } from '@/lib/investments/queries'
import { estimateMonthlyIncome } from '@floow/core-finance'
import { FICalculatorForm } from '@/components/planning/fi-calculator-form'

// -- Async sub-component for Suspense streaming --------------------------------

async function FIContent({ orgId }: { orgId: string }) {
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
    <FICalculatorForm
      defaultValues={retirementPlan}
      currentPortfolioCents={currentPortfolioCents}
      currentPassiveIncomeCents={currentPassiveIncomeCents}
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
