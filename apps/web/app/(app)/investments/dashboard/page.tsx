import { getOrgId } from '@/lib/finance/queries'
import { getPositions, getPatrimonySnapshots } from '@/lib/investments/queries'
import { PortfolioSummaryRow } from '@/components/investments/portfolio-summary-row'
import { AllocationChart } from '@/components/investments/allocation-chart'
import { NetWorthEvolution } from '@/components/investments/net-worth-evolution'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

/**
 * InvestmentDashboardPage — React Server Component (DASH-02, DASH-03).
 *
 * Fetches portfolio positions and patrimony snapshots in parallel, then renders:
 *   a. PortfolioSummaryRow — total value, total PnL, total dividends
 *   b. AllocationChart — pie chart of positions grouped by asset class
 *   c. NetWorthEvolution — line chart of patrimony snapshots over time
 *
 * Empty state shown when no positions exist.
 */
export default async function InvestmentDashboardPage() {
  const orgId = await getOrgId()

  const [positions, snapshots] = await Promise.all([
    getPositions(orgId),
    getPatrimonySnapshots(orgId, 12),
  ])

  // Compute portfolio totals
  const totalValueCents = positions.reduce((sum, p) => sum + p.currentValueCents, 0)
  const totalPnLCents = positions.reduce((sum, p) => sum + p.unrealizedPnLCents, 0)
  const totalDividendsCents = positions.reduce((sum, p) => sum + p.totalDividendsCents, 0)

  const hasPositions = positions.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard de Investimentos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Resumo do seu portfolio e evolucao patrimonial
        </p>
      </div>

      {hasPositions ? (
        <>
          {/* Portfolio Summary Row */}
          <section>
            <h2 className="text-base font-medium text-gray-700 mb-3">Resumo do Portfolio</h2>
            <PortfolioSummaryRow
              totalValueCents={totalValueCents}
              totalPnLCents={totalPnLCents}
              totalDividendsCents={totalDividendsCents}
            />
          </section>

          {/* Allocation Chart */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>Alocacao por Classe de Ativo</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationChart positions={positions} />
              </CardContent>
            </Card>
          </section>

          {/* Net Worth Evolution */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle>Evolucao Patrimonial — Ultimos 12 Meses</CardTitle>
              </CardHeader>
              <CardContent>
                {snapshots.length === 0 ? (
                  <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
                    Nenhum snapshot patrimonial disponivel. Clique em &quot;Atualizar Patrimonio&quot; no dashboard financeiro para gerar.
                  </div>
                ) : (
                  <NetWorthEvolution snapshots={snapshots} />
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-4">
          <p className="text-gray-500 text-sm">Nenhum investimento cadastrado.</p>
          <Link
            href="/investments/new"
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Adicionar Investimento
          </Link>
        </div>
      )}
    </div>
  )
}
