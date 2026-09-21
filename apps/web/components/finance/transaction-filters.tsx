'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useCallback, useRef, useEffect, useTransition } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

type PeriodKey = 'today' | 'month' | 'quarter' | 'semester' | 'year'

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  month: 'Este mês',
  quarter: 'Este trimestre',
  semester: 'Este semestre',
  year: 'Este ano',
}

function getPeriodDates(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (key) {
    case 'today':
      return { startDate: fmt(now), endDate: fmt(now) }
    case 'month':
      return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return { startDate: fmt(new Date(y, q * 3, 1)), endDate: fmt(new Date(y, q * 3 + 3, 0)) }
    }
    case 'semester': {
      const s = m < 6 ? 0 : 1
      return { startDate: fmt(new Date(y, s * 6, 1)), endDate: fmt(new Date(y, s * 6 + 6, 0)) }
    }
    case 'year':
      return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(new Date(y, 11, 31)) }
  }
}

function detectActivePeriod(startDate: string, endDate: string): PeriodKey | null {
  for (const key of Object.keys(PERIOD_LABELS) as PeriodKey[]) {
    const { startDate: s, endDate: e } = getPeriodDates(key)
    if (s === startDate && e === endDate) return key
  }
  return null
}

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
export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions', includeFuture = false }: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '')
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? '')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }, [])

  const activePeriod = detectActivePeriod(startDate, endDate)

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams()
    const values: Record<string, string> = {
      search, accountId, startDate, endDate,
      future: searchParams.get('future') ?? '',
      ...overrides,
    }
    if (values.search) params.set('search', values.search)
    if (values.accountId) params.set('accountId', values.accountId)
    if (values.startDate) params.set('startDate', values.startDate)
    if (values.endDate) params.set('endDate', values.endDate)
    const currentPageSize = searchParams.get('pageSize')
    if (currentPageSize) params.set('pageSize', currentPageSize)
    if (values.future === '1') params.set('future', '1')
    params.set('page', '1')
    startTransition(() => {
      router.replace(`${baseUrl}?${params.toString()}`, { scroll: false })
    })
  }, [router, baseUrl, search, accountId, startDate, endDate, searchParams, startTransition])

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

  const hasFilters = search || accountId || startDate || endDate

  return (
    <div className="space-y-2">
      {/* Period shortcuts — o clique na pílula ativa desmarca */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
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
        <button
          type="button"
          aria-pressed={includeFuture}
          onClick={() => navigate({ future: includeFuture ? '' : '1' })}
          title={
            includeFuture
              ? 'Clique para ocultar o que ainda não aconteceu'
              : 'Incluir os lançamentos previstos com data futura'
          }
          className={`${PILL_BASE} ${
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

        {/* Account — "Todas as contas" é o próprio desmarcar */}
        {!hideAccountFilter && (
          <select
            value={accountId}
            aria-label="Conta"
            onChange={(e) => { setAccountId(e.target.value); navigate({ accountId: e.target.value }) }}
            className={`h-8 rounded-lg border px-3 text-xs ${
              accountId
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            <option value="" className="bg-white text-gray-600">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id} className="bg-white text-gray-600">{a.name}</option>
            ))}
          </select>
        )}

        {/* Date range — cada ponta se solta pelo × ao lado dela */}
        <div className="flex items-center gap-1">
          <input
            type="date"
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
            type="date"
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
