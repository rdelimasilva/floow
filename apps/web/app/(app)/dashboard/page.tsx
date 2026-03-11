import { getOrgId, getAccounts, getRecentTransactions, getLatestSnapshot } from '@/lib/finance/queries'
import { refreshSnapshot } from '@/lib/finance/actions'
import { aggregateCashFlow } from '@floow/core-finance'
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import { CashFlowChart } from '@/components/finance/cash-flow-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * DashboardPage — React Server Component.
 *
 * Fetches all required data in parallel and renders the financial overview:
 *   a. Account Summary Row — per-account balance cards + total
 *   b. Quick Stats Row — current month income / expenses / net
 *   c. Cash Flow Chart — last 6 months bar chart
 *   d. Patrimony Snapshot — net worth with breakdown and refresh button
 *
 * Empty states: prompts to create accounts or register transactions when
 * data is absent.
 */
export default async function DashboardPage() {
  const orgId = await getOrgId()

  // Parallel data fetching
  const [userAccounts, recentTransactions, latestSnapshot] = await Promise.all([
    getAccounts(orgId),
    getRecentTransactions(orgId, 6),
    getLatestSnapshot(orgId),
  ])

  // Aggregate transactions into monthly cash flow data
  const cashFlowData = aggregateCashFlow(recentTransactions)

  // Compute current month stats
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthData = cashFlowData.find((d) => d.month === currentMonth)
  const incomeCents = currentMonthData?.income ?? 0
  const expenseCents = currentMonthData?.expense ?? 0
  const netCents = currentMonthData?.net ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard Financeiro
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Visao geral do seu patrimonio e fluxo de caixa
        </p>
      </div>

      {/* Account Summary Row */}
      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Contas</h2>
        <AccountSummaryRow accounts={userAccounts} />
      </section>

      {/* Quick Stats Row — current month */}
      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Resumo do Mes</h2>
        <QuickStatsRow
          incomeCents={incomeCents}
          expenseCents={expenseCents}
          netCents={netCents}
        />
      </section>

      {/* Cash Flow Chart — last 6 months */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa — Ultimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlowData.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
                Nenhuma transacao encontrada. Importe ou registre transacoes para ver o fluxo de caixa.
              </div>
            ) : (
              <CashFlowChart data={cashFlowData} />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Patrimony Snapshot */}
      <section>
        <PatrimonySummary
          snapshot={latestSnapshot}
          onRefresh={refreshSnapshot}
        />
      </section>
    </div>
  )
}
