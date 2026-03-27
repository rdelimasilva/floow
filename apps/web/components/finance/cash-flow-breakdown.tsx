'use client'

import { useState, useMemo, useDeferredValue } from 'react'
import { formatBRL } from '@floow/core-finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Grouping = 'daily' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'

interface RawTransaction {
  date: string
  dateKey?: string
  amountCents: number
  type: string
  accountId: string
}

interface AccountOption {
  id: string
  name: string
}

interface AggregatedRow {
  key: string
  label: string
  income: number
  expense: number
  net: number
}

interface CashFlowBreakdownProps {
  transactions: RawTransaction[]
  accounts: AccountOption[]
}

const GROUPING_LABELS: Record<Grouping, string> = {
  daily: 'Diário',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

function getGroupKey(dateStr: string, grouping: Grouping): string {
  const normalized = dateStr.split('T')[0]
  const d = new Date(normalized + 'T12:00:00')
  const y = d.getFullYear()
  const m = d.getMonth()

  switch (grouping) {
    case 'daily':
      return normalized
    case 'monthly':
      return `${y}-${String(m + 1).padStart(2, '0')}`
    case 'quarterly': {
      const q = Math.floor(m / 3) + 1
      return `${y}-Q${q}`
    }
    case 'semiannual': {
      const s = m < 6 ? 1 : 2
      return `${y}-S${s}`
    }
    case 'annual':
      return String(y)
  }
}

function getGroupLabel(key: string, grouping: Grouping): string {
  switch (grouping) {
    case 'daily': {
      const d = new Date(key + 'T12:00:00')
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    case 'monthly': {
      const [y, m] = key.split('-')
      return new Date(Number(y), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    }
    case 'quarterly': {
      const [y, q] = key.split('-Q')
      return `${q}º Tri ${y}`
    }
    case 'semiannual': {
      const [y, s] = key.split('-S')
      return `${s}º Sem ${y}`
    }
    case 'annual':
      return key
  }
}

function aggregate(transactions: RawTransaction[], grouping: Grouping): AggregatedRow[] {
  const map = new Map<string, { income: number; expense: number }>()

  for (const tx of transactions) {
    const key = getGroupKey(tx.date, grouping)
    const existing = map.get(key) ?? { income: 0, expense: 0 }
    if (tx.type === 'income') {
      existing.income += tx.amountCents
    } else if (tx.type === 'expense') {
      existing.expense += tx.amountCents
    }
    map.set(key, existing)
  }

  return Array.from(map.entries())
    .map(([key, { income, expense }]) => ({
      key,
      label: getGroupLabel(key, grouping),
      income,
      expense,
      net: income + expense,
    }))
    .sort((a, b) => b.key.localeCompare(a.key))
}

export function CashFlowBreakdown({ transactions = [], accounts = [] }: CashFlowBreakdownProps) {
  const [grouping, setGrouping] = useState<Grouping>('monthly')
  const [accountId, setAccountId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const deferredTransactions = useDeferredValue(transactions)

  const filtered = useMemo(() => {
    let result = deferredTransactions
    if (accountId) result = result.filter((t) => t.accountId === accountId)
    if (startDate) result = result.filter((t) => (t.dateKey ?? t.date.split('T')[0]) >= startDate)
    if (endDate) result = result.filter((t) => (t.dateKey ?? t.date.split('T')[0]) <= endDate)
    return result
  }, [deferredTransactions, accountId, startDate, endDate])

  const hasFilters = accountId || startDate || endDate

  const rows = useMemo(() => aggregate(filtered, grouping), [filtered, grouping])

  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpense = rows.reduce((s, r) => s + Math.abs(r.expense), 0)
  const totalNet = totalIncome - totalExpense

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <CardTitle className="text-sm">Detalhamento</CardTitle>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Account filter */}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
            >
              <option value="">Todas as contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {/* Date range */}
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-600"
            />

            {hasFilters && (
              <button
                type="button"
                onClick={() => { setAccountId(''); setStartDate(''); setEndDate('') }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Grouping toggle */}
          <div className="flex rounded-lg border border-gray-200 p-0.5 gap-0.5 w-fit">
            {(Object.keys(GROUPING_LABELS) as Grouping[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrouping(g)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  grouping === g ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {GROUPING_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma transação encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-100">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {grouping === 'daily' ? 'Data' : grouping === 'monthly' ? 'Mês' : 'Período'}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.key} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-600 capitalize">{r.label}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-green-700">{r.income > 0 ? formatBRL(r.income) : '—'}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-red-600">{r.expense < 0 ? formatBRL(Math.abs(r.expense)) : '—'}</td>
                      <td className={`px-4 py-2 text-right text-sm font-bold ${r.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatBRL(r.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 sticky bottom-0">
                  <tr>
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Total</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-green-700">{formatBRL(totalIncome)}</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-red-600">{formatBRL(totalExpense)}</td>
                    <td className={`px-4 py-2 text-right text-sm font-bold ${totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatBRL(totalNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
