import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOrgId, getTransactionsWithCount, getTransactionCount, getAccounts, getCategories, getCategoryUsageOrder } from '@/lib/finance/queries'
import { paginaQueAbre } from '@/lib/finance/pagination'
import { contasParaLancamento } from '@/lib/finance/account-options'
import { TransactionListWrapper } from '@/components/finance/transaction-list-wrapper'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { InlineTransactionFormProvider, InlineTransactionFormButton, InlineTransactionFormPanel } from '@/components/finance/inline-transaction-form'
import { ExportCsvButton } from '@/components/finance/export-csv-button'
import { Pagination } from '@/components/ui/pagination'
import { PageSizeSelector } from '@/components/ui/page-size-selector'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const
const DEFAULT_PAGE_SIZE = 30

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams
  const orgId = await getOrgId()

  // Resolution order: URL param → cookie (persisted across sessions) → default
  const jar = await cookies()
  const cookiePageSize = jar.get('tx-page-size')?.value
  const requestedSize = parseInt(params.pageSize ?? cookiePageSize ?? '', 10)
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE

  // A conta escolhida sobrevive à troca de menu: o filtro grava em
  // `tx-accounts` e aqui o cookie reabre o que estava marcado.
  //
  // Redireciona em vez de só aplicar por baixo porque a URL é a fonte única de
  // verdade do recorte — dela vivem os links de paginação, o export CSV e o
  // casamento das linhas criadas na hora. Aplicar sem redirecionar deixaria a
  // lista filtrada e o resto da tela achando que não havia filtro.
  const contasDoCookie = jar.get('tx-accounts')?.value
  if (params.accountId === undefined && contasDoCookie) {
    const destino = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
    )
    destino.set('accountId', contasDoCookie)
    redirect(`/transactions?${destino.toString()}`)
  }

  const filters = {
    accountId: params.accountId,
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
    sortBy: params.sortBy ?? 'date',
    // Do mais antigo para o mais novo, como um extrato — ver
    // `buildTransactionOrder`.
    sortDir: params.sortDir ?? 'asc',
    types: params.types,
    categoryIds: params.categoryIds,
    minAmount: params.minAmount ? parseInt(params.minAmount, 10) : undefined,
    maxAmount: params.maxAmount ? parseInt(params.maxAmount, 10) : undefined,
    // A lista abre em hoje. O futuro entra por este toggle — ver o porque em
    // `buildTransactionConditions`.
    includeFuture: params.future === '1',
  }

  // A data mais recente está na ÚLTIMA página quando a ordem é crescente, e é
  // lá que a lista abre. O total custa uma contagem a mais, e só quando a URL
  // não diz a página — navegando, ele já vem de graça na consulta das linhas.
  const page = paginaQueAbre({
    pageParam: params.page,
    totalCount: params.page ? 0 : await getTransactionCount(orgId, filters),
    pageSize,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  })

  const queryOpts = { limit: pageSize, offset: (page - 1) * pageSize, ...filters }

  const [{ transactions, totalCount }, accounts, categories, categoryOrder] =
    await Promise.all([
      getTransactionsWithCount(orgId, queryOpts),
      getAccounts(orgId),
      getCategories(orgId),
      getCategoryUsageOrder(orgId),
    ])

  const totalPages = Math.ceil(totalCount / pageSize)

  const paginationParams: Record<string, string> = {}
  if (filters.accountId) paginationParams.accountId = filters.accountId
  if (filters.search) paginationParams.search = filters.search
  if (filters.startDate) paginationParams.startDate = filters.startDate
  if (filters.endDate) paginationParams.endDate = filters.endDate
  if (filters.includeFuture) paginationParams.future = '1'
  if (filters.sortBy && filters.sortBy !== 'date') paginationParams.sortBy = filters.sortBy
  if (filters.sortDir && filters.sortDir !== 'asc') paginationParams.sortDir = filters.sortDir
  if (params.types) paginationParams.types = params.types
  if (params.categoryIds) paginationParams.categoryIds = params.categoryIds
  if (params.minAmount) paginationParams.minAmount = params.minAmount
  if (params.maxAmount) paginationParams.maxAmount = params.maxAmount
  if (pageSize !== DEFAULT_PAGE_SIZE) paginationParams.pageSize = String(pageSize)

  const accountOptions = contasParaLancamento(accounts)
  const categoryOrderMap = new Map(categoryOrder.map((id, i) => [id, i]))
  const categoryOptions = categories
    // `affectsCashFlow` vai junto para a linha recem-criada pela linha rapida
    // saber mostrar "no fluxo" ou "fora do fluxo" sem esperar recarregar.
    .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId, affectsCashFlow: c.affectsCashFlow }))
    .sort((a, b) => {
      const aIdx = categoryOrderMap.get(a.id) ?? 999
      const bIdx = categoryOrderMap.get(b.id) ?? 999
      return aIdx - bIdx
    })

  return (
    <InlineTransactionFormProvider>
    <div className="space-y-4">
      <PageHeader
        title="Transações"
        description={totalCount > 0
          ? `${totalCount} transação(ões) encontrada(s)`
          : 'Nenhuma transação registrada'}
      >
        <ExportCsvButton />
        <Button asChild variant="outline">
          <Link href="/transactions/import">Importar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/transactions/review">Revisar contrapartes</Link>
        </Button>
        <InlineTransactionFormButton />
      </PageHeader>

      <InlineTransactionFormPanel
        accounts={accountOptions}
        categories={categoryOptions}
      />

      <TransactionFilters accounts={accountOptions} includeFuture={filters.includeFuture} />

      <div className="flex items-center justify-between gap-3">
        <PageSizeSelector current={pageSize} />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          baseUrl="/transactions"
          searchParams={paginationParams}
        />
      </div>

      <TransactionListWrapper
        transactions={transactions.map((t) => ({
          ...t,
          date: t.date instanceof Date ? t.date.toISOString() : t.date,
        }))}
        accounts={accountOptions}
        categories={categoryOptions}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir as 'asc' | 'desc'}
      />

      <div className="flex items-center justify-between gap-3">
        <PageSizeSelector current={pageSize} />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          baseUrl="/transactions"
          searchParams={paginationParams}
        />
      </div>
    </div>
    </InlineTransactionFormProvider>
  )
}
