import { Suspense } from 'react'
import { getOrgId, getRecentTransactions, getFutureTransactions, getAccounts } from '@/lib/finance/queries'
import { CashFlowClient } from '@/components/finance/cash-flow-client'
import { PageHeader } from '@/components/ui/page-header'

async function CashFlowContent({ orgId }: { orgId: string }) {
  const [recentTransactions, futureTransactions, accounts] = await Promise.all([
    getRecentTransactions(orgId, 24),
    getFutureTransactions(orgId),
    getAccounts(orgId),
  ])

  const serialize = (t: typeof recentTransactions[number]) => ({
    date: t.date instanceof Date ? t.date.toISOString().split('T')[0] : String(t.date).split('T')[0],
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
  })

  return (
    <CashFlowClient
      transactions={recentTransactions.map(serialize)}
      futureTransactions={futureTransactions.map(serialize)}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
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
      />

      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /><SectionSkeleton /></>}>
        <CashFlowContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
