import { Suspense } from 'react'
import Link from 'next/link'
import { getOrgId } from '@/lib/finance/queries'
import { PageHeader } from '@/components/ui/page-header'
import { getPlanningDashboardData, getPlanningPortfolioSummary } from '@/lib/planning/queries'
import { calculateFI, SCENARIO_PRESETS } from '@floow/core-finance'
import { PlanningSummaryRow } from '@/components/planning/planning-summary-row'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Users } from 'lucide-react'

// -- Async sub-component for Suspense streaming --------------------------------

async function PlanningHubContent({ orgId }: { orgId: string }) {
  const [{ retirementPlan, withdrawalStrategy, successionPlan }, summary] =
    await Promise.all([
      getPlanningDashboardData(orgId),
      getPlanningPortfolioSummary(orgId),
    ])

  const currentPassiveIncomeCents = summary.currentPassiveIncomeCents
  const currentPortfolioCents = summary.currentPortfolioCents

  // Compute FI progress if a retirement plan exists
  let fiProgressPercent: number | null = null
  let retirementReadiness: string | null = null

  if (retirementPlan) {
    retirementReadiness = 'Plano salvo'
    const fiResult = calculateFI({
      currentPortfolioCents,
      monthlyContributionCents: retirementPlan.monthlyContributionCents,
      targetMonthlyPassiveIncomeCents: retirementPlan.desiredMonthlyIncomeCents,
      annualRealReturnRate: retirementPlan.baseReturnRate != null
        ? Number(retirementPlan.baseReturnRate)
        : SCENARIO_PRESETS.base.annualRealReturnRate,
      currentAge: retirementPlan.currentAge,
    })
    if (fiResult.fiNumberCents > 0) {
      fiProgressPercent = Math.min(
        100,
        Math.round((currentPortfolioCents / fiResult.fiNumberCents) * 100)
      )
    }
  }

  return (
    <>
      <PlanningSummaryRow
        currentPassiveIncomeCents={currentPassiveIncomeCents}
        fiProgressPercent={fiProgressPercent}
        retirementReadiness={retirementReadiness}
        hasSuccessionPlan={successionPlan != null}
      />

      {/* Quick-navigation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/planning/simulation" className="block">
          <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                Simulacao de Aposentadoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Simule aportes ou renda desejada em 3 cenarios, acompanhe o progresso
                ate a independencia financeira, e veja quando o patrimonio se esgota.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/planning/succession" className="block">
          <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-purple-600" />
                Plano Sucessorio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Organize a distribuicao do seu patrimonio entre herdeiros, estime o ITCMD por
                estado e identifique gaps de liquidez na sucessao.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 border-t pt-4">
        As projecoes sao estimativas baseadas em premissas que podem nao se concretizar.
        Rentabilidades passadas nao garantem rentabilidades futuras. Consulte um profissional
        habilitado (planejador financeiro, contador ou advogado) para decisoes financeiras importantes.
      </p>
    </>
  )
}

// -- Page ----------------------------------------------------------------------

/**
 * PlanningPage — planning hub with 4 summary cards and navigation to detail pages.
 * RSC with Suspense streaming — data fetched in PlanningHubContent async sub-component.
 */
export default async function PlanningPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planejamento Financeiro"
        description="Simulacoes, independencia financeira e planejamento patrimonial"
      />

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          </div>
        }
      >
        <PlanningHubContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
