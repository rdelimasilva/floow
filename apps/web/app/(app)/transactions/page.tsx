import Link from 'next/link'
import { getOrgId, getTransactions, getTransactionCount, getAccounts, getCategories } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 30

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const filters = {
    accountId: params.accountId,
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
  }

  const [transactions, totalCount, accounts, categories] = await Promise.all([
    getTransactions(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getTransactionCount(orgId, filters),
    getAccounts(orgId),
    getCategories(orgId),
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const paginationParams: Record<string, string> = {}
  if (filters.accountId) paginationParams.accountId = filters.accountId
  if (filters.search) paginationParams.search = filters.search
  if (filters.startDate) paginationParams.startDate = filters.startDate
  if (filters.endDate) paginationParams.endDate = filters.endDate

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Transações</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalCount > 0
              ? `${totalCount} transação(ões) encontrada(s)`
              : 'Nenhuma transação registrada'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/transactions/import">Importar</Link>
          </Button>
          <Button asChild variant="primary">
            <Link href="/transactions/new">Nova Transação</Link>
          </Button>
        </div>
      </div>

      <TransactionFilters accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <TransactionList
        transactions={transactions.map((t) => ({
          ...t,
          isAutoCategorized: t.isAutoCategorized,
        }))}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl="/transactions"
        searchParams={paginationParams}
      />
    </div>
  )
}
