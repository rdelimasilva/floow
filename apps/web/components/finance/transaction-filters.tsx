'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

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
}

export function TransactionFilters({ accounts, hideAccountFilter, baseUrl = '/transactions' }: TransactionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '')
  const [startDate, setStartDate] = useState(searchParams.get('startDate') ?? '')
  const [endDate, setEndDate] = useState(searchParams.get('endDate') ?? '')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }, [])

  const activePeriod = detectActivePeriod(startDate, endDate)

  const navigate = useCallback((overrides: Record<string, string>) => {
    const params = new URLSearchParams()
    const values = { search, accountId, startDate, endDate, ...overrides }
    if (values.search) params.set('search', values.search)
    if (values.accountId) params.set('accountId', values.accountId)
    if (values.startDate) params.set('startDate', values.startDate)
    if (values.endDate) params.set('endDate', values.endDate)
    params.set('page', '1')
    router.push(`${baseUrl}?${params.toString()}`)
  }, [router, baseUrl, search, accountId, startDate, endDate])

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setStartDate('')
    setEndDate('')
    router.push(baseUrl)
  }

  const hasFilters = search || accountId || startDate || endDate

  return (
    <div className="space-y-2">
      {/* Period shortcuts */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const { startDate: s, endDate: e } = getPeriodDates(key)
              setStartDate(s)
              setEndDate(e)
              navigate({ startDate: s, endDate: e })
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activePeriod === key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Existing filters row */}
      <div className="flex flex-wrap items-center gap-2">
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
            className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-600 placeholder:text-gray-400"
          />
        </div>

        {/* Account */}
        {!hideAccountFilter && (
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); navigate({ accountId: e.target.value }) }}
            className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {/* Date range */}
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); navigate({ startDate: e.target.value }) }}
          className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
        />
        <span className="text-xs text-gray-400">até</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); navigate({ endDate: e.target.value }) }}
          className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
        />

        {/* Clear */}
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  )
}
