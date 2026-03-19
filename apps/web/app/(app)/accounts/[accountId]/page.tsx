import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote, PiggyBank, TrendingUp, CreditCard, Wallet } from 'lucide-react'
import { getOrgId, getAccountById, getTransactions, getTransactionCount, getCategories } from '@/lib/finance/queries'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatBRL } from '@floow/core-finance'

const PAGE_SIZE = 30

const ACCOUNT_TYPE_CONFIG: Record<string, { label: string; Icon: typeof Banknote }> = {
  checking: { label: 'Conta Corrente', Icon: Banknote },
  savings: { label: 'Poupança', Icon: PiggyBank },
  brokerage: { label: 'Corretora', Icon: TrendingUp },
  credit_card: { label: 'Cartão de Crédito', Icon: CreditCard },
  cash: { label: 'Dinheiro', Icon: Wallet },
}

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

  const [transactions, totalCount, categories] = await Promise.all([
    getTransactions(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    getTransactionCount(orgId, filters),
    getCategories(orgId),
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
        transactions={transactions}
        accounts={[{ id: account.id, name: account.name }]}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
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
