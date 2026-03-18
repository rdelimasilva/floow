'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

  function applyFilters() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (accountId) params.set('accountId', accountId)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    params.set('page', '1')
    router.push(`${baseUrl}?${params.toString()}`)
  }

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setStartDate('')
    setEndDate('')
    router.push(baseUrl)
  }

  const hasFilters = search || accountId || startDate || endDate

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Descricao..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {!hideAccountFilter && (
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Conta</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="">Todas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Data inicio</label>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
      </div>

      <div className="min-w-[140px]">
        <label className="block text-xs font-medium text-gray-500 mb-1">Data fim</label>
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={applyFilters} className="h-9">
          Filtrar
        </Button>
        {hasFilters && (
          <Button size="sm" variant="outline" onClick={clearFilters} className="h-9">
            Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
