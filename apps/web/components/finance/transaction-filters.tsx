'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

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
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
        <input
          placeholder="Buscar descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate({ search: e.currentTarget.value }) }}
          onBlur={(e) => { if (e.target.value !== (searchParams.get('search') ?? '')) navigate({ search: e.target.value }) }}
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
  )
}
