import { Suspense } from 'react'
import { getOrgId, getRecentTransactions, getAccounts } from '@/lib/finance/queries'
import { CashFlowClient } from '@/components/finance/cash-flow-client'
import { PageHeader } from '@/components/ui/page-header'

async function CashFlowContent({ orgId }: { orgId: string }) {
  const [recentTransactions, accounts] = await Promise.all([
    getRecentTransactions(orgId, 24),
    getAccounts(orgId),
  ])

  const serializedTransactions = recentTransactions.map((t) => ({
    date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
  }))

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <CashFlowClient
      transactions={serializedTransactions}
      accounts={accountOptions}
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
