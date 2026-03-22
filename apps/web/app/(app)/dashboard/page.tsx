import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId, getAccounts, getRecentTransactions, getLatestSnapshot } from '@/lib/finance/queries'
import { refreshSnapshot } from '@/lib/finance/actions'
import { aggregateCashFlow } from '@floow/core-finance'
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import { CashFlowChart } from '@/components/finance/cash-flow-chart'
import { BudgetAlertCard } from '@/components/finance/budget-alert-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getBudgetGoals, getSpendingByCategory, getInvestmentContributions, getAdjustmentTotal, getCurrentPeriodRange } from '@/lib/finance/budget-queries'

// -- Async sub-components for Suspense streaming ----------------------------

async function AccountSection({ orgId }: { orgId: string }) {
  const userAccounts = await getAccounts(orgId)
  return <AccountSummaryRow accounts={userAccounts} />
}

async function StatsSection({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 6)
  const cashFlowData = aggregateCashFlow(recentTransactions)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthData = cashFlowData.find((d) => d.month === currentMonth)
  return (
    <QuickStatsRow
      incomeCents={currentMonthData?.income ?? 0}
      expenseCents={currentMonthData?.expense ?? 0}
      netCents={currentMonthData?.net ?? 0}
    />
  )
}

async function ChartSection({ orgId }: { orgId: string }) {
  const recentTransactions = await getRecentTransactions(orgId, 6)
  const cashFlowData = aggregateCashFlow(recentTransactions)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo de Caixa — Últimos 6 Meses</CardTitle>
      </CardHeader>
      <CardContent>
        {cashFlowData.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma transação encontrada. Importe ou registre transações para ver o fluxo de caixa.
          </div>
        ) : (
          <CashFlowChart data={cashFlowData} />
        )}
      </CardContent>
    </Card>
  )
}

async function PatrimonySection({ orgId }: { orgId: string }) {
  const latestSnapshot = await getLatestSnapshot(orgId)
  return (
    <PatrimonySummary
      snapshot={latestSnapshot}
      onRefresh={refreshSnapshot}
    />
  )
}

async function BudgetAlertSection({ orgId }: { orgId: string }) {
  const [spendingGoals, investingGoals] = await Promise.all([
    getBudgetGoals(orgId, 'spending'),
    getBudgetGoals(orgId, 'investing'),
  ])

  const alerts: { name: string; currentCents: number; limitCents: number; href: string }[] = []

  for (const goal of spendingGoals) {
    const { start, end } = getCurrentPeriodRange(goal.period)
    const [spending, adj] = await Promise.all([
      getSpendingByCategory(orgId, start, end),
      getAdjustmentTotal(goal.id, start, end),
    ])
    const totalSpent = spending.reduce((sum, s) => sum + Number(s.spent), 0) + adj
    const pct = goal.targetCents > 0 ? (totalSpent / goal.targetCents) * 100 : 0
    if (pct >= 80) {
      alerts.push({ name: goal.name, currentCents: totalSpent, limitCents: goal.targetCents, href: '/budgets/spending' })
    }
  }

  for (const goal of investingGoals) {
    const { start, end } = getCurrentPeriodRange(goal.period)
    const [contributed, adj] = await Promise.all([
      getInvestmentContributions(orgId, start, end),
      getAdjustmentTotal(goal.id, start, end),
    ])
    const totalContributed = contributed + adj
    const now = new Date()
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const expectedPct = (elapsedDays / totalDays) * 100
    const actualPct = goal.targetCents > 0 ? (totalContributed / goal.targetCents) * 100 : 0
    if (actualPct < expectedPct * 0.8) {
      alerts.push({ name: goal.name, currentCents: totalContributed, limitCents: goal.targetCents, href: '/budgets/investing' })
    }
  }

  return <BudgetAlertCard alerts={alerts} />
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
      <PageHeader
        title="Dashboard Financeiro"
        description="Visão geral do seu patrimônio e fluxo de caixa"
      />

      {/* Stats Row */}
      <Suspense fallback={<SectionSkeleton />}>
        <StatsSection orgId={orgId} />
      </Suspense>

      {/* Budget Alerts */}
      <Suspense fallback={null}>
        <BudgetAlertSection orgId={orgId} />
      </Suspense>

      {/* Chart + Accounts Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Suspense fallback={<SectionSkeleton />}>
          <ChartSection orgId={orgId} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <AccountSection orgId={orgId} />
        </Suspense>
      </div>

      {/* Patrimony */}
      <Suspense fallback={<SectionSkeleton />}>
        <PatrimonySection orgId={orgId} />
      </Suspense>
    </div>
  )
}
