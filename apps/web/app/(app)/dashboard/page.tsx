import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId, getAccounts, getRecentTransactions, getLatestSnapshot, getTransactionsWithCount } from '@/lib/finance/queries'
import { refreshSnapshot } from '@/lib/finance/actions'
import { aggregateCashFlow } from '@floow/core-finance'
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import dynamic from 'next/dynamic'

const CashFlowChart = dynamic(() => import('@/components/finance/cash-flow-chart').then(m => ({ default: m.CashFlowChart })), {
  loading: () => <div className="min-h-[300px] animate-pulse rounded-xl bg-gray-100" />,
})
import { BudgetAlertCard } from '@/components/finance/budget-alert-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getBudgetGoals, getBudgetEntriesForMonth, getSpendingByCategory, getInvestmentContributions, getAdjustmentTotalsForGoals, getCurrentPeriodRange } from '@/lib/finance/budget-queries'
import { WelcomeCard } from '@/components/finance/welcome-card'
// import { CfoDashboardStrip } from '@/components/cfo/cfo-dashboard-strip'

// -- Async sub-components for Suspense streaming ----------------------------

async function OnboardingSection({ orgId }: { orgId: string }) {
  const [userAccounts, { totalCount }] = await Promise.all([
    getAccounts(orgId),
    getTransactionsWithCount(orgId, { limit: 1 }),
  ])
  return (
    <WelcomeCard
      hasAccounts={userAccounts.length > 0}
      hasTransactions={totalCount > 0}
    />
  )
}

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
  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [budgetEntriesData, spendingData, investingGoals] = await Promise.all([
    getBudgetEntriesForMonth(orgId, currentMonth),
    getSpendingByCategory(orgId, currentMonth, currentMonthEnd),
    getBudgetGoals(orgId, 'investing'),
  ])

  const alerts: { name: string; currentCents: number; limitCents: number; href: string }[] = []

  // Spending alerts from budget entries
  const totalPlanned = budgetEntriesData.reduce((sum, e) => sum + e.plannedCents, 0)
  const totalSpent = spendingData.reduce((sum, s) => sum + s.spent, 0)
  if (totalPlanned > 0) {
    const pct = (totalSpent / totalPlanned) * 100
    if (pct >= 80) {
      alerts.push({ name: 'Orçamento mensal', currentCents: totalSpent, limitCents: totalPlanned, href: '/budgets/spending' })
    }
  }

  if (investingGoals.length === 0) {
    return <BudgetAlertCard alerts={alerts} />
  }

  const goalsByPeriod = new Map<string, typeof investingGoals>()
  for (const goal of investingGoals) {
    const periodGoals = goalsByPeriod.get(goal.period) ?? []
    periodGoals.push(goal)
    goalsByPeriod.set(goal.period, periodGoals)
  }

  await Promise.all(
    Array.from(goalsByPeriod.entries()).map(async ([period, goals]) => {
      const { start, end } = getCurrentPeriodRange(period)
      const [contributed, adjustmentTotals] = await Promise.all([
        getInvestmentContributions(orgId, start, end),
        getAdjustmentTotalsForGoals(orgId, goals.map((goal) => goal.id), start, end),
      ])

      for (const goal of goals) {
        const totalContributed = contributed + (adjustmentTotals.get(goal.id) ?? 0)
        const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        const expectedPct = (elapsedDays / totalDays) * 100
        const actualPct = goal.targetCents > 0 ? (totalContributed / goal.targetCents) * 100 : 0
        if (actualPct < expectedPct * 0.8) {
          alerts.push({ name: goal.name, currentCents: totalContributed, limitCents: goal.targetCents, href: '/budgets/investing' })
        }
      }
    })
  )

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

      {/* Onboarding — auto-hides once steps are completed */}
      <Suspense fallback={null}>
        <OnboardingSection orgId={orgId} />
      </Suspense>

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
