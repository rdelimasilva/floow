import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId } from '@/lib/finance/queries'
import { getPositions, getPatrimonySnapshots } from '@/lib/investments/queries'
import { PortfolioSummaryRow } from '@/components/investments/portfolio-summary-row'
import dynamic from 'next/dynamic'

const AllocationChart = dynamic(() => import('@/components/investments/allocation-chart').then(m => ({ default: m.AllocationChart })), {
  loading: () => <div className="min-h-[200px] animate-pulse rounded-xl bg-gray-100" />,
})

const NetWorthEvolution = dynamic(() => import('@/components/investments/net-worth-evolution').then(m => ({ default: m.NetWorthEvolution })), {
  loading: () => <div className="min-h-[200px] animate-pulse rounded-xl bg-gray-100" />,
})
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

// -- Async sub-components for Suspense streaming ----------------------------

async function PortfolioContent({ orgId }: { orgId: string }) {
  const [positions, snapshots] = await Promise.all([
    getPositions(orgId),
    getPatrimonySnapshots(orgId, 12),
  ])

  const totalValueCents = positions.reduce((sum, p) => sum + p.currentValueCents, 0)
  const totalPnLCents = positions.reduce((sum, p) => sum + p.unrealizedPnLCents, 0)
  const totalDividendsCents = positions.reduce((sum, p) => sum + p.totalDividendsCents, 0)

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
        <p className="text-gray-500 text-sm">Nenhum investimento cadastrado.</p>
        <Link
          href="/investments/new"
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Adicionar Investimento
        </Link>
      </div>
    )
  }

  return (
    <>
      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Resumo do Portfólio</h2>
        <PortfolioSummaryRow
          totalValueCents={totalValueCents}
          totalPnLCents={totalPnLCents}
          totalDividendsCents={totalDividendsCents}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Alocação por Classe de Ativo</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationChart positions={positions} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Evolução Patrimonial — Últimos 12 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
                Nenhum snapshot patrimonial disponível. Clique em &quot;Atualizar Patrimônio&quot; no dashboard financeiro para gerar.
              </div>
            ) : (
              <NetWorthEvolution snapshots={snapshots.map((s) => ({
                ...s,
                snapshotDate: s.snapshotDate instanceof Date ? s.snapshotDate.toISOString() : s.snapshotDate,
                createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
              }))} />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  )
}

/**
 * InvestmentDashboardPage — React Server Component with Suspense streaming.
 */
export default async function InvestmentDashboardPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard de Investimentos"
        description="Resumo do seu portfólio e evolução patrimonial"
      />

      <Suspense fallback={
        <div className="space-y-6">
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      }>
        <PortfolioContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
