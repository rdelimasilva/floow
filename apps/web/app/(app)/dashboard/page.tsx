import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { getOrgId, getAccounts, getMonthlyCashFlowSummary, getCategories } from '@/lib/finance/queries'
import { getValorDasContasDeInvestimento } from '@/lib/openfinance/queries'
import { getPatrimonioAtual } from '@/lib/finance/patrimonio-queries'
import { refreshSnapshot } from '@/lib/finance/account-actions'
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import dynamic from 'next/dynamic'

const CashFlowChart = dynamic(() => import('@/components/finance/cash-flow-chart').then(m => ({ default: m.CashFlowChart })), {
  loading: () => <div className="min-h-[300px] animate-pulse rounded-xl bg-gray-100" />,
})
import { BudgetAlertCard } from '@/components/finance/budget-alert-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getBudgetEntriesForMonth, getSpendingByCategory, getInvestmentContributions } from '@/lib/finance/budget-queries'
import { alertasDeAporte } from '@/lib/finance/alertas-de-aporte'
import { getSpendingPlanForMonth } from '@/lib/finance/recurring-budget-queries'
import { sumBudgetedSpending, rollUpSpendingToBudgeted } from '@/lib/finance/budgeted-spending'
import { WelcomeCard } from '@/components/finance/welcome-card'
import { getEstadoDoCadastro } from '@/lib/onboarding/estado-do-cadastro'
import { CfoDashboardStrip } from '@/components/cfo/cfo-dashboard-strip'
import { getTopInsights } from '@/lib/cfo/queries'

// -- Async sub-components for Suspense streaming ----------------------------

async function OnboardingSection({ orgId }: { orgId: string }) {
  return <WelcomeCard estado={await getEstadoDoCadastro(orgId)} />
}

async function AccountSection({ orgId }: { orgId: string }) {
  // Mesmo valor da tela Contas: conta de investimento do Open Finance vale as
  // posições, não o saldo de lançamentos.
  const [userAccounts, valorDasPosicoes] = await Promise.all([
    getAccounts(orgId),
    getValorDasContasDeInvestimento(orgId),
  ])
  return <AccountSummaryRow accounts={userAccounts} valorDasPosicoes={valorDasPosicoes} />
}

async function StatsSection({ orgId }: { orgId: string }) {
  const cashFlowData = await getMonthlyCashFlowSummary(orgId, 6)
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
  // A consulta devolve do mais novo para o mais antigo; o gráfico lê da esquerda
  // para a direita, como a tela Fluxo de Caixa (que ordena do mesmo jeito).
  // A consulta pega desde o mesmo dia de 6 meses atrás e devolve 7 meses (o
  // primeiro pela metade); o título promete 6.
  const cashFlowData = [...(await getMonthlyCashFlowSummary(orgId, 6))]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6)
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
  // Calculado agora, com a regra da tela Contas — não o último snapshot, que
  // só era refeito no clique e ficava semanas para trás.
  const patrimonio = await getPatrimonioAtual(orgId)
  return <PatrimonySummary patrimonio={patrimonio} onRefresh={refreshSnapshot} />
}

async function BudgetAlertSection({ orgId }: { orgId: string }) {
  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // Metas de aporte: as da tela Meta de Investimentos (`budget_entries`), com
  // o aportado do mês pela mesma consulta que ela usa.
  const [budgetEntriesData, spendingData, investingEntries, contributed, categories, insights] = await Promise.all([
    getSpendingPlanForMonth(orgId, currentMonth, currentMonthEnd),
    getSpendingByCategory(orgId, currentMonth, currentMonthEnd),
    getBudgetEntriesForMonth(orgId, currentMonth, 'investing'),
    getInvestmentContributions(orgId, currentMonth, currentMonthEnd),
    getCategories(orgId),
    // Mesma chamada da faixa do Consultor (fica em cache): o que ela mostra não se repete aqui.
    getTopInsights(orgId, 3),
  ])

  const alerts: { name: string; currentCents: number; limitCents: number; href: string }[] = []

  // Spending alerts from budget entries
  const totalPlanned = budgetEntriesData.reduce((sum, e) => sum + e.plannedCents, 0)
  const totalSpent = sumBudgetedSpending(
    rollUpSpendingToBudgeted(spendingData, categories, budgetEntriesData),
    budgetEntriesData,
  )
  const consultorJaAvisou = insights.some((i) => i.type === 'budget_pacing_month_over')
  if (totalPlanned > 0 && !consultorJaAvisou) {
    const pct = (totalSpent / totalPlanned) * 100
    if (pct >= 80) {
      alerts.push({ name: 'Orçamento mensal', currentCents: totalSpent, limitCents: totalPlanned, href: '/budgets/spending' })
    }
  }

  alerts.push(...alertasDeAporte(investingEntries, contributed, currentMonth, currentMonthEnd, now))

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

      {/* Números do mês primeiro; o passo a passo (some quando termina) vem
          logo abaixo, no mesmo Suspense, para não empurrar a tela ao chegar. */}
      <Suspense fallback={<SectionSkeleton />}>
        <StatsSection orgId={orgId} />
        <OnboardingSection orgId={orgId} />
      </Suspense>

      {/* Consultor (os 3 alertas mais graves do dia) e metas em risco chegam juntos. */}
      <Suspense fallback={<SectionSkeleton />}>
        <CfoDashboardStrip orgId={orgId} />
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
