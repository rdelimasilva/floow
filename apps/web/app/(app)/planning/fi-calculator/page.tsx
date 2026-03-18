import { Suspense } from 'react'
import { getOrgId } from '@/lib/finance/queries'
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Calculadora de Independencia Financeira
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Descubra quanto voce precisa acumular para viver de renda e quando vai atingir esse numero.
        </p>
      </div>

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
