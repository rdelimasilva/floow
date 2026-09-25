import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Banknote } from 'lucide-react'
import { getOrgId, getAccountById, getTransactionsWithCount, getTransactionCount, getCategories, getAccounts } from '@/lib/finance/queries'
import { paginaQueAbre, filtrosAteHoje } from '@/lib/finance/pagination'
import { hojeEmSaoPaulo } from '@/lib/finance/filtros-lembrados'
import { TransactionList } from '@/components/finance/transaction-list'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatBRL } from '@floow/core-finance'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/finance/account-types'
import { getAtivosDaContaDeInvestimento, getValorDasContasDeInvestimento } from '@/lib/openfinance/queries'
import { getPositions } from '@/lib/investments/queries'
import { PositionTable } from '@/components/investments/position-table'

const PAGE_SIZE = 30


interface Props {
  params: Promise<{ accountId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AccountDetailPage({ params, searchParams }: Props) {
  const { accountId } = await params
  const sp = await searchParams
  const orgId = await getOrgId()

  // A conta, as categorias e a lista de contas não dependem da página: saem
  // junto com a contagem, e `notFound()` decide quando conta e contagem voltam.
  const accountP = getAccountById(orgId, accountId)
  const categoriesP = getCategories(orgId)
  // Todas as contas da org, e não só esta: a edição inline monta o dropdown
  // de conta de destino a partir deste prop, filtrando a conta do próprio
  // lançamento. Passando só a conta atual, o filtro esvaziava a lista e o
  // select de destino ficava sem nenhuma opção. A lista de lançamentos
  // continua restrita a esta conta pelo `filters.accountId`, que é outra
  // coisa.
  const allAccountsP = getAccounts(orgId)
  const valorDasPosicoesP = getValorDasContasDeInvestimento(orgId)
  const ativosDaContaP = getAtivosDaContaDeInvestimento(orgId, accountId)
  // Falha enquanto outra espera não vira "unhandled rejection"; o erro sobe
  // no await de cada uma.
  categoriesP.catch(() => {})
  allAccountsP.catch(() => {})
  valorDasPosicoesP.catch(() => {})
  ativosDaContaP.catch(() => {})

  const filters = {
    accountId,
    search: sp.search,
    startDate: sp.startDate,
    endDate: sp.endDate,
    // O toggle "Lançamentos futuros" também vive aqui, e antes o clique só
    // mexia na URL: a página nunca lia `future`, então a lista não mudava.
    includeFuture: sp.future === '1',
  }

  // O extrato da conta corre do mais antigo para o mais novo, como o de
  // transações, e abre na última página — onde está a data mais recente.
  // Com futuros ligados, abre na página de hoje, não na da parcela mais distante.
  const [account, [totalParaAbrir, totalAteHoje]] = await Promise.all([
    accountP,
    sp.page
      ? ([0, undefined] as const)
      : Promise.all([
          getTransactionCount(orgId, filters),
          filters.includeFuture
            ? getTransactionCount(orgId, filtrosAteHoje(filters, hojeEmSaoPaulo()))
            : undefined,
        ]),
  ])
  if (!account) notFound()

  const page = paginaQueAbre({
    pageParam: sp.page,
    totalCount: totalParaAbrir,
    totalAteHoje,
    pageSize: PAGE_SIZE,
  })

  const [{ transactions, totalCount }, categories, allAccounts] = await Promise.all([
    getTransactionsWithCount(orgId, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, ...filters }),
    categoriesP,
    allAccountsP,
  ])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const paginationParams: Record<string, string> = {}
  if (sp.search) paginationParams.search = sp.search
  if (sp.startDate) paginationParams.startDate = sp.startDate
  if (sp.endDate) paginationParams.endDate = sp.endDate
  if (filters.includeFuture) paginationParams.future = '1'

  const config = ACCOUNT_TYPE_CONFIG[account.type] ?? { label: account.type, Icon: Banknote }
  const { Icon, label } = config
  // Conta de investimentos do Open Finance vale o que as posições valem; o
  // saldo de lançamentos dela fica zerado numa conexão só de investimentos.
  const valorDasPosicoesCents = (await valorDasPosicoesP).get(account.id)
  const saldoExibidoCents = valorDasPosicoesCents ?? account.balanceCents
  const isNegative = saldoExibidoCents < 0
  // Conta de investimentos abre nos ativos: o extrato dela costuma estar vazio.
  const ativosDaConta = new Set(await ativosDaContaP)
  const posicoes = ativosDaConta.size > 0
    ? (await getPositions(orgId)).filter((p) => ativosDaConta.has(p.assetId))
    : []
  const ehContaDeAtivos = ativosDaConta.size > 0

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
            {formatBRL(saldoExibidoCents)}
          </p>
          {valorDasPosicoesCents !== undefined && (
            <p className="text-xs text-gray-400">Valor das posições informadas pelo banco</p>
          )}
        </div>
      </div>

      {ehContaDeAtivos && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500">Ativos ({posicoes.length})</h2>
          <PositionTable positions={posicoes} orgId={orgId} />
        </section>
      )}

      {/* Extrato: na conta de ativos, só quando há lançamento (aplicação ligada pelo extrato). */}
      {(!ehContaDeAtivos || totalCount > 0) && (<>
      {ehContaDeAtivos && <h2 className="text-sm font-medium text-gray-500">Movimentações na conta</h2>}

      {/* Filters (without account selector) */}
      <TransactionFilters
        accounts={[]}
        hideAccountFilter
        baseUrl={`/accounts/${accountId}`}
        includeFuture={filters.includeFuture}
      />

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
        sortDir="asc"
      />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        baseUrl={`/accounts/${accountId}`}
        searchParams={paginationParams}
      />
      </>)}
    </div>
  )
}
