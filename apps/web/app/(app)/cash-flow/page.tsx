import { Suspense } from 'react'
import { getOrgId, getRecentTransactions, getFutureTransactions, getAccounts, getMonthlyCashFlowSummary, getFutureMonthlyCashFlowSummary, getGastosMensaisPorCategoria } from '@/lib/finance/queries'
import { resumirFluxo } from '@floow/core-finance/src/fluxo-resumo'
import { ResumoDoFluxoCard } from '@/components/finance/resumo-do-fluxo'
import { CashFlowClient } from '@/components/finance/cash-flow-client'
import { PageHeader } from '@/components/ui/page-header'
import { BotaoDeExportar } from '@/components/finance/export-csv-button'

async function CashFlowContent({ orgId }: { orgId: string }) {
  const [recentTransactions, futureTransactions, monthlyRealized, monthlyProjected, accounts, gastosPorCategoria] = await Promise.all([
    getRecentTransactions(orgId, 24),
    getFutureTransactions(orgId),
    getMonthlyCashFlowSummary(orgId, 24),
    getFutureMonthlyCashFlowSummary(orgId, 24),
    getAccounts(orgId),
    getGastosMensaisPorCategoria(orgId, 7),
  ])

  const mesAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const resumo = resumirFluxo(monthlyRealized, gastosPorCategoria, mesAtual)

  const serialize = (t: typeof recentTransactions[number]) => ({
    date: t.date instanceof Date ? t.date.toISOString().split('T')[0] : String(t.date).split('T')[0],
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
  })

  return (
    <>
      {resumo && <ResumoDoFluxoCard resumo={resumo} />}
      <CashFlowClient
        transactions={recentTransactions.map(serialize)}
        futureTransactions={futureTransactions.map(serialize)}
        monthlyRealized={monthlyRealized}
        monthlyProjected={monthlyProjected}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      />
    </>
  )
}

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
}

export default async function CashFlowPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Receitas, despesas e saldo por período"
      >
        <div className="hidden sm:contents">
          <BotaoDeExportar
            url="/api/cash-flow/export"
            arquivo="fluxo-de-caixa.xlsx"
            rotulo="Exportar Excel"
            erro="Não foi possível exportar o fluxo de caixa. Tente de novo."
          />
        </div>
      </PageHeader>

      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /><SectionSkeleton /></>}>
        <CashFlowContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
