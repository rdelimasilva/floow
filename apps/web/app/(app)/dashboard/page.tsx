import { Suspense } from 'react'
import { getOrgId, getAccounts, getRecentTransactions, getLatestSnapshot } from '@/lib/finance/queries'
import { refreshSnapshot } from '@/lib/finance/actions'
import { aggregateCashFlow } from '@floow/core-finance'
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import { CashFlowChart } from '@/components/finance/cash-flow-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// -- Async sub-components for Suspense streaming ----------------------------

async function AccountSection({ orgId }: { orgId: string }) {
  const userAccounts = await getAccounts(orgId)
  return <AccountSummaryRow accounts={userAccounts} />
}

async function StatsAndChartSection({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 6)
  const cashFlowData = aggregateCashFlow(recentTransactions)

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthData = cashFlowData.find((d) => d.month === currentMonth)
  const incomeCents = currentMonthData?.income ?? 0
  const expenseCents = currentMonthData?.expense ?? 0
  const netCents = currentMonthData?.net ?? 0

  return (
    <>
      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Resumo do Mês</h2>
        <QuickStatsRow
          incomeCents={incomeCents}
          expenseCents={expenseCents}
          netCents={netCents}
        />
      </section>
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de Caixa — Últimos 6 Meses</CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlowData.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
                Nenhuma transação encontrada. Importe ou registre transações para ver o fluxo de caixa.
              </div>
            ) : (
              <CashFlowChart data={cashFlowData} />
            )}
          </CardContent>
        </Card>
      </section>
    </>
  )
}

async function PatrimonySection({ orgId }: { orgId: string }) {
  const latestSnapshot = await getLatestSnapshot(orgId)
  return (
    <section>
      <PatrimonySummary
        snapshot={latestSnapshot}
        onRefresh={refreshSnapshot}
      />
    </section>
  )
}

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
}

/**
 * DashboardPage — React Server Component with Suspense streaming.
 *
 * Each section loads independently so the page streams progressively.
 */
export default async function DashboardPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Dashboard Financeiro
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Visão geral do seu patrimônio e fluxo de caixa
        </p>
      </div>

      {/* Account Summary Row */}
      <section>
        <h2 className="text-base font-medium text-gray-700 mb-3">Contas</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <AccountSection orgId={orgId} />
        </Suspense>
      </section>

      {/* Quick Stats + Cash Flow Chart */}
      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /></>}>
        <StatsAndChartSection orgId={orgId} />
      </Suspense>

      {/* Patrimony Snapshot */}
      <Suspense fallback={<SectionSkeleton />}>
        <PatrimonySection orgId={orgId} />
      </Suspense>
    </div>
  )
}
