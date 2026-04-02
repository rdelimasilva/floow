'use client'

import { useState, useMemo, useDeferredValue } from 'react'
import { formatBRL } from '@floow/core-finance'
import { CashFlowPeriodFilter, getPeriodDates, type PeriodKey } from './cash-flow-period-filter'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import dynamic from 'next/dynamic'
import type { MonthlyCashFlowSummary } from '@/lib/finance/queries'

const CashFlowChart = dynamic(() => import('./cash-flow-chart').then(m => ({ default: m.CashFlowChart })), {
  loading: () => <div className="min-h-[300px] animate-pulse rounded-xl bg-gray-100" />,
  ssr: false,
})
import { CashFlowBreakdown } from './cash-flow-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RawTransaction {
  date: string
  amountCents: number
  type: string
  accountId: string
}

interface PreparedTransaction extends RawTransaction {
  dateKey: string
  month: string
}

interface AccountOption {
  id: string
  name: string
}

type ViewMode = 'realized' | 'projected' | 'both'

const VIEW_LABELS: Record<ViewMode, string> = {
  realized: 'Realizado',
  projected: 'Projetado',
  both: 'Ambos',
}

interface CashFlowClientProps {
  transactions: RawTransaction[]
  futureTransactions: RawTransaction[]
  monthlyRealized: MonthlyCashFlowSummary[]
  monthlyProjected: MonthlyCashFlowSummary[]
  accounts: AccountOption[]
}

export function CashFlowClient({
  transactions,
  futureTransactions,
  monthlyRealized,
  monthlyProjected,
  accounts,
}: CashFlowClientProps) {
  const [period, setPeriod] = useState<PeriodKey>('last12')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [viewMode, setViewMode] = useState<ViewMode>('realized')
  const [hideTransfers, setHideTransfers] = useState(true)

  const preparedTransactions = useMemo<PreparedTransaction[]>(
    () => transactions.map((t) => {
      const dateKey = t.date.split('T')[0]
      return { ...t, dateKey, month: dateKey.slice(0, 7) }
    }),
    [transactions],
  )

  const preparedFutureTransactions = useMemo<PreparedTransaction[]>(
    () => futureTransactions.map((t) => {
      const dateKey = t.date.split('T')[0]
      return { ...t, dateKey, month: dateKey.slice(0, 7) }
    }),
    [futureTransactions],
  )

  // Get date range for current period
  const { startDate, endDate } = useMemo(() => getPeriodDates(period), [period])

  // Filter realized transactions by period + transfer toggle
  const filteredRealized = useMemo(() => {
    return preparedTransactions.filter((t) => {
      if (hideTransfers && t.type === 'transfer') return false
      return t.dateKey >= startDate && t.dateKey <= endDate
    })
  }, [preparedTransactions, startDate, endDate, hideTransfers])

  // Filter future transactions by period + transfer toggle
  const filteredFuture = useMemo(() => {
    return preparedFutureTransactions.filter((t) => {
      if (hideTransfers && t.type === 'transfer') return false
      return t.dateKey >= startDate && t.dateKey <= endDate
    })
  }, [preparedFutureTransactions, startDate, endDate, hideTransfers])

  // Pick which transactions to show based on view mode
  const activeTransactions = useMemo(() => {
    if (viewMode === 'realized') return filteredRealized
    if (viewMode === 'projected') return filteredFuture
    return [...filteredRealized, ...filteredFuture]
  }, [viewMode, filteredRealized, filteredFuture])

  const deferredActiveTransactions = useDeferredValue(activeTransactions)

  const monthRange = useMemo(() => ({
    startMonth: startDate.slice(0, 7),
    endMonth: endDate.slice(0, 7),
  }), [startDate, endDate])

  const realizedData = useMemo(
    () => monthlyRealized
      .filter((item) => item.month >= monthRange.startMonth && item.month <= monthRange.endMonth)
      .sort((a, b) => a.month.localeCompare(b.month)),
    [monthlyRealized, monthRange.endMonth, monthRange.startMonth],
  )

  const projectedData = useMemo(
    () => monthlyProjected
      .filter((item) => item.month >= monthRange.startMonth && item.month <= monthRange.endMonth)
      .sort((a, b) => a.month.localeCompare(b.month)),
    [monthlyProjected, monthRange.endMonth, monthRange.startMonth],
  )

  // Merge realized + projected for "both" mode
  const mergedData = useMemo(() => {
    if (viewMode === 'realized') return realizedData
    if (viewMode === 'projected') return projectedData

    // Merge by month key
    const map = new Map<string, { month: string; income: number; expense: number; net: number; projectedIncome: number; projectedExpense: number; projectedNet: number }>()

    for (const d of realizedData) {
      map.set(d.month, {
        month: d.month,
        income: d.income,
        expense: Math.abs(d.expense),
        net: d.net,
        projectedIncome: 0,
        projectedExpense: 0,
        projectedNet: 0,
      })
    }

    for (const d of projectedData) {
      const existing = map.get(d.month)
      if (existing) {
        existing.projectedIncome = d.income
        existing.projectedExpense = Math.abs(d.expense)
        existing.projectedNet = d.net
      } else {
        map.set(d.month, {
          month: d.month,
          income: 0,
          expense: 0,
          net: 0,
          projectedIncome: d.income,
          projectedExpense: Math.abs(d.expense),
          projectedNet: d.net,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
  }, [viewMode, realizedData, projectedData])

  const chartData = useMemo(() => {
    if (viewMode !== 'both') {
      const src = viewMode === 'realized' ? realizedData : projectedData
      return src
    }
    return mergedData
  }, [viewMode, realizedData, projectedData, mergedData])

  // Summary stats
  const summaryData = viewMode === 'realized' ? realizedData
    : viewMode === 'projected' ? projectedData
    : [...realizedData, ...projectedData]

  const totalIncome = summaryData.reduce((sum, d) => sum + d.income, 0)
  const totalExpense = summaryData.reduce((sum, d) => sum + Math.abs(d.expense), 0)
  const totalNet = totalIncome - totalExpense
  const avgMonthlyNet = summaryData.length > 0
    ? summaryData.reduce((sum, d) => sum + d.net, 0) / summaryData.length
    : 0

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Receitas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Despesas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(totalExpense)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Saldo {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className={`mt-2 text-xl font-bold ${totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(totalNet)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Média Mensal</p>
          <p className={`mt-2 text-xl font-bold ${avgMonthlyNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(Math.round(avgMonthlyNet))}
          </p>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CashFlowChartPicker activeType={chartType} onChange={setChartType} />
          {chartData.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nenhuma transação encontrada para o período selecionado.
            </div>
          ) : (
            <CashFlowChart data={chartData} chartType={chartType} viewMode={viewMode} />
          )}
        </CardContent>
      </Card>

      {/* Filters below chart */}
      <CashFlowPeriodFilter
        activePeriod={period}
        onChange={(p) => setPeriod(p)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hideTransfers}
            onChange={(e) => setHideTransfers(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-xs text-gray-600">Ocultar transferências</span>
        </label>

        {futureTransactions.length === 0 && (
          <span className="text-xs text-gray-400">
            Sem lançamentos futuros (crie transações recorrentes para projetar)
          </span>
        )}
      </div>

      {/* Breakdown */}
      <CashFlowBreakdown
        transactions={deferredActiveTransactions}
        accounts={accounts}
      />
    </>
  )
}
