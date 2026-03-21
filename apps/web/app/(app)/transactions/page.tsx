import Link from 'next/link'
import { getOrgId, getTransactionsWithCount, getAccounts, getCategories } from '@/lib/finance/queries'
import { TransactionListWrapper } from '@/components/finance/transaction-list-wrapper'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { InlineTransactionFormProvider, InlineTransactionFormButton, InlineTransactionFormPanel } from '@/components/finance/inline-transaction-form'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

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
    sortBy: params.sortBy ?? 'date',
    sortDir: params.sortDir ?? 'desc',
    types: params.types,
    categoryIds: params.categoryIds,
    minAmount: params.minAmount ? parseInt(params.minAmount, 10) : undefined,
    maxAmount: params.maxAmount ? parseInt(params.maxAmount, 10) : undefined,
  }

  const [{ transactions, totalCount }, accounts, categories] = await Promise.all([
    getTransactionsWithCount(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getAccounts(orgId),
    getCategories(orgId),
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const paginationParams: Record<string, string> = {}
  if (filters.accountId) paginationParams.accountId = filters.accountId
  if (filters.search) paginationParams.search = filters.search
  if (filters.startDate) paginationParams.startDate = filters.startDate
  if (filters.endDate) paginationParams.endDate = filters.endDate
  if (filters.sortBy && filters.sortBy !== 'date') paginationParams.sortBy = filters.sortBy
  if (filters.sortDir && filters.sortDir !== 'desc') paginationParams.sortDir = filters.sortDir
  if (params.types) paginationParams.types = params.types
  if (params.categoryIds) paginationParams.categoryIds = params.categoryIds
  if (params.minAmount) paginationParams.minAmount = params.minAmount
  if (params.maxAmount) paginationParams.maxAmount = params.maxAmount

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))

  return (
    <InlineTransactionFormProvider>
    <div className="space-y-4">
      <PageHeader
        title="Transações"
        description={totalCount > 0
          ? `${totalCount} transação(ões) encontrada(s)`
          : 'Nenhuma transação registrada'}
      >
        <Button asChild variant="outline">
          <Link href="/transactions/import">Importar</Link>
        </Button>
        <InlineTransactionFormButton />
      </PageHeader>

      <InlineTransactionFormPanel
        accounts={accountOptions}
        categories={categoryOptions}
      />

      <TransactionFilters accounts={accountOptions} />

      <TransactionListWrapper
        transactions={transactions}
        accounts={accountOptions}
        categories={categoryOptions}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir as 'asc' | 'desc'}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl="/transactions"
        searchParams={paginationParams}
      />
    </div>
    </InlineTransactionFormProvider>
  )
}
