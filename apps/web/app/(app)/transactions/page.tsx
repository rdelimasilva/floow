import Link from 'next/link'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOrgId, getTransactionsWithCount, getTransactionCount, getAccounts, getCategories, getCategoryUsageOrder } from '@/lib/finance/queries'
import { paginaQueAbre, filtrosAteHoje } from '@/lib/finance/pagination'
import { contasParaLancamento, contasDeTransferencia } from '@/lib/finance/account-options'
import { contasDoFiltro } from '@/lib/finance/queries-transactions'
import { getFaturasDoExtrato } from '@/lib/finance/queries-fatura'
import { getFinaisDoCartao } from '@/lib/finance/queries-final-do-cartao'
import { intervaloDaPagina } from '@/lib/finance/intercalar-faturas'
import { TransactionListWrapper } from '@/components/finance/transaction-list-wrapper'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { InlineTransactionFormProvider, InlineTransactionFormButton, InlineTransactionFormPanel } from '@/components/finance/inline-transaction-form'
import { ExportCsvButton } from '@/components/finance/export-csv-button'
import { Pagination } from '@/components/ui/pagination'
import { PageSizeSelector } from '@/components/ui/page-size-selector'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { PendingQueuesSlot } from '@/components/finance/pending-queues-slot'
import { getVerifiedIdentity } from '@/lib/auth/session'
import { FILTERS_COOKIE, restaurarFiltros, temFiltroNaUrl, hojeEmSaoPaulo } from '@/lib/finance/filtros-lembrados'

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

  // A tela reabre com os filtros do último uso (`lib/finance/filtros-lembrados`).
  // Só quando a URL chega sem recorte nenhum: link que já traz filtro é escolha
  // de quem chegou. Cookie vazio é "o usuário limpou tudo" — não restaura.
  const filtrosDoCookie = jar.get(FILTERS_COOKIE)?.value
  if (filtrosDoCookie && !temFiltroNaUrl(params)) {
    const destino = restaurarFiltros(filtrosDoCookie)
    if (destino.toString()) {
      if (params.pageSize) destino.set('pageSize', params.pageSize)
      if (params.nova) destino.set('nova', params.nova)
      redirect(`/transactions?${destino.toString()}`)
    }
  }

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
    cardDigits: params.cardDigits,
  }

  // O que não depende da página sai já, junto com a contagem abaixo. Só a
  // consulta das linhas precisa esperar o número da página.
  const independentes = Promise.all([
    getAccounts(orgId),
    getCategories(orgId),
    getCategoryUsageOrder(orgId),
    getVerifiedIdentity().then((identity) => identity?.userId ?? null),
    getFinaisDoCartao(orgId, contasDoFiltro(filters)),
  ])
  // Uma falha aqui enquanto a contagem ainda roda não pode virar "unhandled
  // rejection"; o erro de verdade sobe no await lá embaixo.
  independentes.catch(() => {})

  // A data mais recente está na ÚLTIMA página quando a ordem é crescente, e é
  // lá que a lista abre. O total custa uma contagem a mais, e só quando a URL
  // não diz a página — navegando, ele já vem de graça na consulta das linhas.
  // Com futuros ligados a última página é a parcela mais distante (2031), então
  // conta-se também até hoje para abrir na página de hoje.
  const [totalParaAbrir, totalAteHoje] = params.page
    ? [0, undefined]
    : await Promise.all([
        getTransactionCount(orgId, filters),
        filters.includeFuture
          ? getTransactionCount(orgId, filtrosAteHoje(filters, hojeEmSaoPaulo()))
          : undefined,
      ])
  const page = paginaQueAbre({
    pageParam: params.page,
    totalCount: totalParaAbrir,
    totalAteHoje,
    pageSize,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  })

  const queryOpts = { limit: pageSize, offset: (page - 1) * pageSize, ...filters }

  const [{ transactions, totalCount }, [accounts, categories, categoryOrder, userId, finaisDoCartao]] = await Promise.all([
    getTransactionsWithCount(orgId, queryOpts),
    independentes,
  ])

  const totalPages = Math.ceil(totalCount / pageSize)

  // Cartão marcado no filtro ganha a linha do total da fatura no fechamento.
  // Só na ordem por data: em outra ordem não há "dia do fechamento" na lista.
  const marcadas = new Set(contasDoFiltro(filters))
  const faturas = filters.sortBy === 'date'
    ? await getFaturasDoExtrato(
        orgId,
        accounts.filter((a) => marcadas.has(a.id)),
        intervaloDaPagina(transactions.map((t) => t.date), {
          ultimaCronologica: filters.sortDir === 'asc' ? page >= totalPages : page === 1,
          startDate: filters.startDate,
          endDate: filters.endDate,
        }),
      )
    : []

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
  if (params.cardDigits) paginationParams.cardDigits = params.cardDigits
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
          ? `${totalCount} ${totalCount === 1 ? 'transação encontrada' : 'transações encontradas'}`
          : 'Nenhuma transação registrada'}
      >
        <ExportCsvButton />
        <Button asChild variant="outline">
          <Link href="/transactions/import">Importar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/transactions/review">Classificar lançamentos</Link>
        </Button>
        <InlineTransactionFormButton />
      </PageHeader>

      <InlineTransactionFormPanel
        accounts={accountOptions}
        transferAccounts={contasDeTransferencia(accounts)}
        categories={categoryOptions}
      />

      {/* As filas moram aqui, e nao no menu: item fixo ocupa lugar permanente
          para uma decisao que aparece poucas vezes por mes, e some do campo de
          visao de quem esta olhando os lancamentos — que e onde o assunto
          surge. Fila vazia nao renderiza nada. */}
      <Suspense fallback={null}>
        <PendingQueuesSlot orgId={orgId} userId={userId} />
      </Suspense>

      <TransactionFilters accounts={accountOptions} includeFuture={filters.includeFuture} cardDigitsOptions={finaisDoCartao} />

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
        faturas={faturas}
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
