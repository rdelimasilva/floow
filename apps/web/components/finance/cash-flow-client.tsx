'use client'

import { useState, useMemo, useDeferredValue } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { CashFlowPeriodFilter } from './cash-flow-period-filter'
import { AccountFilter } from './account-filter'
import { PERIOD_GROUPS, getPeriodDates, type PeriodKey } from '@/lib/finance/filtros-lembrados'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import dynamic from 'next/dynamic'

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

// As mesmas pílulas da tela de Transações.
const PILL_BASE = 'h-8 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors'
const PILL_OFF = 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
const PILL_ON = 'bg-gray-900 border border-gray-900 text-white'

interface CashFlowClientProps {
  transactions: RawTransaction[]
  futureTransactions: RawTransaction[]
  accounts: AccountOption[]
}

function preparar(list: RawTransaction[]): PreparedTransaction[] {
  return list.map((t) => {
    const dateKey = t.date.split('T')[0]
    return { ...t, dateKey, month: dateKey.slice(0, 7) }
  })
}

interface MesDoGrafico {
  month: string
  income: number
  expense: number
  net: number
  projectedIncome: number
  projectedExpense: number
  projectedNet: number
}

/** Receita e despesa por mês, separando o projetado para o modo "Ambos". */
function porMes(realizado: PreparedTransaction[], projetado: PreparedTransaction[]): MesDoGrafico[] {
  const map = new Map<string, MesDoGrafico>()
  const somar = (t: PreparedTransaction, proj: boolean) => {
    if (t.type !== 'income' && t.type !== 'expense') return
    const m = map.get(t.month) ?? {
      month: t.month, income: 0, expense: 0, net: 0, projectedIncome: 0, projectedExpense: 0, projectedNet: 0,
    }
    const valor = Math.abs(t.amountCents)
    if (t.type === 'income') m[proj ? 'projectedIncome' : 'income'] += valor
    else m[proj ? 'projectedExpense' : 'expense'] += valor
    m.net = m.income - m.expense
    m.projectedNet = m.projectedIncome - m.projectedExpense
    map.set(t.month, m)
  }
  realizado.forEach((t) => somar(t, false))
  projetado.forEach((t) => somar(t, true))
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export function CashFlowClient({ transactions, futureTransactions, accounts }: CashFlowClientProps) {
  const [{ startDate, endDate }, setPeriodo] = useState(() => getPeriodDates('last12Months'))
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [viewMode, setViewMode] = useState<ViewMode>('realized')
  const [hideTransfers, setHideTransfers] = useState(true)

  const preparedTransactions = useMemo(() => preparar(transactions), [transactions])
  const preparedFutureTransactions = useMemo(() => preparar(futureTransactions), [futureTransactions])

  // Período, conta e transferências valem para cards, gráfico e detalhamento.
  // Data vazia é ponta aberta, como em Transações ("Todo o período").
  const filtrar = useMemo(() => (list: PreparedTransaction[]) => list.filter((t) =>
    (!hideTransfers || t.type !== 'transfer')
    && (accountIds.length === 0 || accountIds.includes(t.accountId))
    && (!startDate || t.dateKey >= startDate)
    && (!endDate || t.dateKey <= endDate),
  ), [hideTransfers, accountIds, startDate, endDate])

  const filteredRealized = useMemo(() => filtrar(preparedTransactions), [filtrar, preparedTransactions])
  const filteredFuture = useMemo(() => filtrar(preparedFutureTransactions), [filtrar, preparedFutureTransactions])

  const activeTransactions = useMemo(() => {
    if (viewMode === 'realized') return filteredRealized
    if (viewMode === 'projected') return filteredFuture
    return [...filteredRealized, ...filteredFuture]
  }, [viewMode, filteredRealized, filteredFuture])

  const deferredActiveTransactions = useDeferredValue(activeTransactions)

  const chartData = useMemo(() => {
    if (viewMode === 'realized') return porMes(filteredRealized, [])
    if (viewMode === 'projected') return porMes(filteredFuture, [])
    return porMes(filteredRealized, filteredFuture)
  }, [viewMode, filteredRealized, filteredFuture])

  function escolherPeriodo(s: string, e: string, key: PeriodKey | null) {
    setPeriodo({ startDate: s, endDate: e })
    // Atalho de passado ou de futuro já leva ao modo que tem dado para ele.
    if (key && PERIOD_GROUPS[0].keys.includes(key)) setViewMode('realized')
    if (key && PERIOD_GROUPS[2].keys.includes(key)) setViewMode('projected')
  }

  // Cards: mesmos lançamentos e mesma regra da tabela de detalhamento. O
  // resumo mensal filtrado por mês contava o mês de borda inteiro enquanto a
  // tabela corta por dia, e os totais não batiam.
  const summary = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    const months = new Set<string>()
    for (const t of activeTransactions) {
      if (t.type === 'income') totalIncome += t.amountCents
      else if (t.type === 'expense') totalExpense += Math.abs(t.amountCents)
      else continue
      months.add(t.month)
    }
    const totalNet = totalIncome - totalExpense
    return {
      totalIncome,
      totalExpense,
      totalNet,
      avgMonthlyNet: months.size > 0 ? totalNet / months.size : 0,
    }
  }, [activeTransactions])
  const { totalIncome, totalExpense, totalNet, avgMonthlyNet } = summary

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <CashFlowPeriodFilter startDate={startDate} endDate={endDate} onChange={escolherPeriodo} />
          <AccountFilter accounts={accounts} selected={accountIds} onChange={setAccountIds} />
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`${PILL_BASE} ${viewMode === mode ? PILL_ON : PILL_OFF}`}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={hideTransfers}
            onClick={() => setHideTransfers((v) => !v)}
            className={`${PILL_BASE} ${hideTransfers ? PILL_ON : PILL_OFF}`}
          >
            Ocultar transferências
          </button>
        </div>
        {futureTransactions.length === 0 && (
          <p className="text-xs text-gray-400">
            Sem lançamentos futuros (crie transações recorrentes para projetar)
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Receitas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-blue-600">{formatBRL(totalIncome)}</p>
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
          <p className={`mt-2 text-xl font-bold ${totalNet >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
            {formatBRL(totalNet)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Média Mensal</p>
          <p className={`mt-2 text-xl font-bold ${avgMonthlyNet >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
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

      {/* Breakdown */}
      <CashFlowBreakdown transactions={deferredActiveTransactions} />
    </>
  )
}
