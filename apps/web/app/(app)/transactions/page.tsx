import Link from 'next/link'
import { getOrgId, getTransactions } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { Button } from '@/components/ui/button'

export default async function TransactionsPage() {
  const orgId = await getOrgId()
  const transactions = await getTransactions(orgId, { limit: 50 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Transações</h1>
          <p className="mt-1 text-sm text-gray-500">
            {transactions.length > 0
              ? `${transactions.length} transação(ões) encontrada(s)`
              : 'Nenhuma transação registrada'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/transactions/import">Importar</Link>
          </Button>
          <Button asChild>
            <Link href="/transactions/new">Nova Transação</Link>
          </Button>
        </div>
      </div>

      <TransactionList transactions={transactions} />
    </div>
  )
}
