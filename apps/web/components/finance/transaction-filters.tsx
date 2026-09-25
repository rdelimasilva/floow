'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { AccountFilter } from './account-filter'
import { CardDigitsFilter } from './card-digits-filter'
import type { FinalDoCartao } from '@/lib/finance/queries-final-do-cartao'
import {
  PERIOD_LABELS,
  PERIOD_GROUPS,
  type PeriodKey,
  getPeriodDates,
  detectActivePeriod,
  lembrarFiltros,
} from '@/lib/finance/filtros-lembrados'

// Filtros de coluna e ordenação vivem na tabela; trocar período, busca ou
// conta não pode levá-los embora.
const PARAMS_DA_TABELA = ['types', 'categoryIds', 'minAmount', 'maxAmount', 'sortBy', 'sortDir'] as const

interface AccountOption {
  id: string
  name: string
}

interface TransactionFiltersProps {
  accounts: AccountOption[]
  hideAccountFilter?: boolean
  baseUrl?: string
  /** Estado atual do recorte: a lista abre em hoje e o futuro entra por opcao. */
  includeFuture?: boolean
  /** Finais de cartão das contas marcadas. Com menos de dois, o filtro não aparece. */
  cardDigitsOptions?: FinalDoCartao[]
}

/**
 * A escolha de conta atravessa a troca de menu.
 *
 * Só a URL não bastava: sair para o Dashboard e voltar em Transações voltava
 * para "todas as contas", e quem trabalha numa conta refazia o filtro a cada
 * volta. O cookie é escrito a TODA mudança, inclusive quando esvazia — senão
 * "todas as contas" seria impossível de pedir, porque o servidor leria o
 * cookie antigo e ressuscitaria a conta recém-desmarcada.
 */
const ACCOUNTS_COOKIE = 'tx-accounts'

function persistirContas(ids: string[]) {
  document.cookie = `${ACCOUNTS_COOKIE}=${ids.join(',')}; path=/; max-age=31536000; SameSite=Lax`
}

const PILL_BASE = 'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors'
const PILL_OFF = 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'

/**
 * Cada filtro se desliga onde foi ligado.
 *
 * Antes havia um "Limpar" separado: longe do controle e com alcance total —
 * soltar o período levava embora a busca e a conta no mesmo clique. Agora a
 * pílula ativa clicada volta ao neutro, a busca tem o × dentro do campo e cada
 * data tem o seu, então nenhum clique mexe em filtro que o usuário não tocou.
 */
export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions', includeFuture = false, cardDigitsOptions = [] }: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [accountIds, setAccountIds] = useState<string[]>(
    (searchParams.get('accountId') ?? '').split(',').filter(Boolean),
  )
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }, [])

  // Os campos acompanham a URL: seleção restaurada do último uso, pílula ou
  // qualquer outra navegação aparece nas datas e na conta, não só a digitada.
  const urlStart = searchParams.get('startDate') ?? ''
  const urlEnd = searchParams.get('endDate') ?? ''
  const urlAccounts = searchParams.get('accountId') ?? ''
  useEffect(() => { setStartDate(urlStart) }, [urlStart])
  useEffect(() => { setEndDate(urlEnd) }, [urlEnd])
  useEffect(() => { setAccountIds(urlAccounts.split(',').filter(Boolean)) }, [urlAccounts])

  // Quem chega por link com filtro (do Dashboard, de um aviso) também conta
  // como último uso.
  useEffect(() => {
    if (baseUrl === '/transactions') lembrarFiltros(new URLSearchParams(searchParams.toString()))
  }, [baseUrl, searchParams])

  const activePeriod = detectActivePeriod(startDate, endDate)

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams()
    const values: Record<string, string> = {
      search, startDate, endDate,
      accountId: accountIds.join(','),
      future: searchParams.get('future') ?? '',
      cardDigits: searchParams.get('cardDigits') ?? '',
      ...overrides,
    }
    if (values.search) params.set('search', values.search)
    if (values.accountId) params.set('accountId', values.accountId)
    if (values.startDate) params.set('startDate', values.startDate)
    if (values.endDate) params.set('endDate', values.endDate)
    const currentPageSize = searchParams.get('pageSize')
    if (currentPageSize) params.set('pageSize', currentPageSize)
    if (values.future === '1') params.set('future', '1')
    if (values.cardDigits) params.set('cardDigits', values.cardDigits)
    for (const key of PARAMS_DA_TABELA) {
      const v = searchParams.get(key)
      if (v) params.set(key, v)
    }
    // Sem `page`: quem decide onde a lista abre é o servidor (`paginaQueAbre`),
    // e na ordem cronológica isso é a ÚLTIMA página. Fixar `page=1` aqui jogava
    // o usuário em 2019 a cada mudança de filtro.
    // Na tela de Transações a seleção fica lembrada para a próxima visita; a
    // página da conta usa este mesmo componente e não entra nessa memória.
    if (baseUrl === '/transactions') lembrarFiltros(params)
    startTransition(() => {
      router.replace(`${baseUrl}?${params.toString()}`, { scroll: false })
    })
  }, [router, baseUrl, search, accountIds, startDate, endDate, searchParams, startTransition])

  /** Clicar na pílula ativa é o gesto de soltar o recorte, não de reaplicá-lo. */
  function togglePeriod(key: PeriodKey) {
    const { startDate: s, endDate: e } = activePeriod === key
      ? { startDate: '', endDate: '' }
      : getPeriodDates(key)
    setStartDate(s)
    setEndDate(e)
    navigate({ startDate: s, endDate: e })
  }

  function clearSearch() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setSearch('')
    navigate({ search: '' })
  }

  function trocarContas(ids: string[]) {
    setAccountIds(ids)
    persistirContas(ids)
    // O final pertence ao cartão: trocar a conta solta os finais escolhidos.
    navigate({ accountId: ids.join(','), cardDigits: '' })
  }

  const finaisMarcados = (searchParams.get('cardDigits') ?? '').split(',').filter(Boolean)
  const hasFilters = search || accountIds.length > 0 || startDate || endDate || finaisMarcados.length > 0

  return (
    <div className="space-y-2">
      {/* Atalhos de período em grupos — o clique na pílula ativa desmarca */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {PERIOD_GROUPS.map((group) => (
          <div key={group.label} role="group" aria-label={group.label} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">{group.label}</span>
            {group.keys.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={activePeriod === key}
                onClick={() => togglePeriod(key)}
                title={activePeriod === key ? 'Clique para remover este período' : undefined}
                className={`${PILL_BASE} ${
                  activePeriod === key ? 'bg-gray-900 text-white' : PILL_OFF
                }`}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          aria-pressed={includeFuture}
          onClick={() => navigate({ future: includeFuture ? '' : '1' })}
          title={
            includeFuture
              ? 'Clique para ocultar o que ainda não aconteceu'
              : 'Incluir os lançamentos previstos com data futura'
          }
          className={`${PILL_BASE} md:ml-auto ${
            includeFuture ? 'bg-amber-100 border border-amber-300 text-amber-800' : PILL_OFF
          }`}
        >
          Lançamentos futuros
        </button>
      </div>

      {/* Mobile: toggle button for filters */}
      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        className="md:hidden flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
        {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
      </button>

      {/* Filters row — always visible on desktop, collapsible on mobile */}
      <div className={`flex-wrap items-center gap-2 ${filtersOpen ? 'flex' : 'hidden md:flex'}`}>
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
          <input
            placeholder="Buscar descrição..."
            value={search}
            onChange={(e) => {
              const value = e.target.value
              setSearch(value)
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
              searchTimerRef.current = setTimeout(() => navigate({ search: value }), 400)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
                navigate({ search: e.currentTarget.value })
              }
            }}
            className={`h-8 w-full rounded-lg border border-gray-200 bg-white pl-9 text-xs text-gray-600 placeholder:text-gray-400 ${
              search ? 'pr-8' : 'pr-3'
            }`}
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              title="Limpar busca"
              onClick={clearSearch}
              className="absolute right-1.5 top-1.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Contas — várias de uma vez, e a marcada se desmarca no clique */}
        {!hideAccountFilter && (
          <AccountFilter accounts={accounts} selected={accountIds} onChange={trocarContas} />
        )}

        {/* Final do cartão — só quando a fatura marcada tem mais de um */}
        {cardDigitsOptions.length > 1 && (
          <CardDigitsFilter
            options={cardDigitsOptions}
            selected={finaisMarcados}
            onChange={(digits) => navigate({ cardDigits: digits.join(',') })}
          />
        )}

        {/* Date range — cada ponta se solta pelo × ao lado dela */}
        <div className="flex items-center gap-1">
          <input
            type="date" min="1900-01-01" max="2100-12-31"
            aria-label="Data inicial"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); navigate({ startDate: e.target.value }) }}
            className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
          />
          {startDate && (
            <button
              type="button"
              aria-label="Limpar data inicial"
              title="Limpar data inicial"
              onClick={() => { setStartDate(''); navigate({ startDate: '' }) }}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">até</span>
        <div className="flex items-center gap-1">
          <input
            type="date" min="1900-01-01" max="2100-12-31"
            aria-label="Data final"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); navigate({ endDate: e.target.value }) }}
            className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
          />
          {endDate && (
            <button
              type="button"
              aria-label="Limpar data final"
              title="Limpar data final"
              onClick={() => { setEndDate(''); navigate({ endDate: '' }) }}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
