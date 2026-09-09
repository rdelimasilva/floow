import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote } from 'lucide-react'
import { getOrgId, getAccountById, getTransactionsWithCount, getCategories, getAccounts } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatBRL } from '@floow/core-finance'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/finance/account-types'

const PAGE_SIZE = 30


interface Props {
  params: Promise<{ accountId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AccountDetailPage({ params, searchParams }: Props) {
  const { accountId } = await params
  const sp = await searchParams
  const orgId = await getOrgId()

  const account = await getAccountById(orgId, accountId)
  if (!account) notFound()

  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const filters = {
    accountId,
    search: sp.search,
    startDate: sp.startDate,
    endDate: sp.endDate,
  }

  const [{ transactions, totalCount }, categories, allAccounts] = await Promise.all([
    getTransactionsWithCount(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getCategories(orgId),
    // Todas as contas da org, e não só esta: a edição inline monta o dropdown
    // de conta de destino a partir deste prop, filtrando a conta do próprio
    // lançamento. Passando só a conta atual, o filtro esvaziava a lista e o
    // select de destino ficava sem nenhuma opção. A lista de lançamentos
    // continua restrita a esta conta pelo `filters.accountId`, que é outra
    // coisa.
    getAccounts(orgId),
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const paginationParams: Record<string, string> = {}
  if (sp.search) paginationParams.search = sp.search
  if (sp.startDate) paginationParams.startDate = sp.startDate
  if (sp.endDate) paginationParams.endDate = sp.endDate

  const config = ACCOUNT_TYPE_CONFIG[account.type] ?? { label: account.type, Icon: Banknote }
  const { Icon, label } = config
  const isNegative = account.balanceCents < 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/accounts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <PageHeader
            title={account.name}
            description={label}
          >
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </div>
          </PageHeader>
          <p className={`text-lg font-semibold ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
            {formatBRL(account.balanceCents)}
          </p>
        </div>
      </div>

      {/* Filters (without account selector) */}
      <TransactionFilters accounts={[]} hideAccountFilter baseUrl={`/accounts/${accountId}`} />

      {/* Transaction count */}
      <p className="text-sm text-gray-500">
        {totalCount > 0 ? `${totalCount} transação(ões)` : 'Nenhuma transação nesta conta'}
      </p>

      {/* Transaction list */}
      <TransactionList
        transactions={transactions.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
        }))}
        accounts={allAccounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }))}
      />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl={`/accounts/${accountId}`}
        searchParams={paginationParams}
      />
    </div>
  )
}
