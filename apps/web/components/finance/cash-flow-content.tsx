import { getRecentTransactions, getFutureTransactions, getAccounts } from '@/lib/finance/queries'
import { CashFlowClient } from '@/components/finance/cash-flow-client'

interface Props {
  orgId: string
  startDate: string
  endDate: string
  accountIds: string[]
}

/** Os lançamentos vêm do período escolhido, não de uma janela fixa de meses. */
export async function CashFlowContent({ orgId, startDate, endDate, accountIds }: Props) {
  const [recentTransactions, futureTransactions, accounts] = await Promise.all([
    getRecentTransactions(orgId, { inicio: startDate || undefined, fim: endDate || undefined }),
    getFutureTransactions(orgId),
    getAccounts(orgId),
  ])

  const serialize = (t: typeof recentTransactions[number]) => ({
    id: t.id,
    date: t.date instanceof Date ? t.date.toISOString().split('T')[0] : String(t.date).split('T')[0],
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
    description: t.description,
    categoryName: t.categoryName,
  })

  return (
    <CashFlowClient
      transactions={recentTransactions.map(serialize)}
      futureTransactions={futureTransactions.map(serialize)}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, titular: a.titular, type: a.type }))}
      startDate={startDate}
      endDate={endDate}
      // Conta que não existe mais sairia filtrando tudo; a página já a tirou da URL.
      accountIds={accountIds.filter((id) => accounts.some((a) => a.id === id))}
    />
  )
}
