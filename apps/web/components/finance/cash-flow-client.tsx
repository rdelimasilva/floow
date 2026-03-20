'use client'

import { useState, useMemo } from 'react'
import { aggregateCashFlow, formatBRL } from '@floow/core-finance'
import { CashFlowPeriodFilter, getPeriodDates, type PeriodKey } from './cash-flow-period-filter'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import { CashFlowChart } from './cash-flow-chart'
import { CashFlowBreakdown } from './cash-flow-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RawTransaction {
  date: string
  amountCents: number
  type: string
  accountId: string
}

interface AccountOption {
  id: string
  name: string
}

interface CashFlowClientProps {
  transactions: RawTransaction[]
  accounts: AccountOption[]
}

export function CashFlowClient({ transactions, accounts }: CashFlowClientProps) {
  const [period, setPeriod] = useState<PeriodKey>('last12')
  const [chartType, setChartType] = useState<ChartType>('bar')

  // Get date range for current period
  const { startDate, endDate } = useMemo(() => getPeriodDates(period), [period])

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.date.split('T')[0]
      return d >= startDate && d <= endDate
    })
  }, [transactions, startDate, endDate])

  // Aggregate for chart
  const cashFlowData = useMemo(() => {
    const agg = aggregateCashFlow(filteredTransactions.map((t) => ({
      ...t,
      date: new Date(t.date),
    })))
    return [...agg].reverse() // ascending for chart
  }, [filteredTransactions])

  // Summary stats
  const totalIncome = cashFlowData.reduce((sum, d) => sum + d.income, 0)
  const totalExpense = cashFlowData.reduce((sum, d) => sum + Math.abs(d.expense), 0)
  const totalNet = totalIncome - totalExpense
  const avgMonthlyNet = cashFlowData.length > 0
    ? cashFlowData.reduce((sum, d) => sum + d.net, 0) / cashFlowData.length
    : 0

  return (
    <>
      {/* Period filter */}
      <CashFlowPeriodFilter
        activePeriod={period}
        onChange={(p) => setPeriod(p)}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas</p>
          <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas</p>
          <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(totalExpense)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</p>
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

      {/* Chart type picker + Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CashFlowChartPicker activeType={chartType} onChange={setChartType} />
          {cashFlowData.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nenhuma transação encontrada para o período selecionado.
            </div>
          ) : (
            <CashFlowChart data={cashFlowData} chartType={chartType} />
          )}
        </CardContent>
      </Card>

      {/* Breakdown */}
      <CashFlowBreakdown
        transactions={filteredTransactions}
        accounts={accounts}
      />
    </>
  )
}
