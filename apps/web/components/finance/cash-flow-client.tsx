'use client'

import { useState, useMemo, useDeferredValue, useEffect } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { CashFlowPeriodFilter } from './cash-flow-period-filter'
import { AccountFilter } from './account-filter'
import { PERIOD_GROUPS, detectActivePeriod, getPeriodDates, hojeEmSaoPaulo, type PeriodKey } from '@/lib/finance/filtros-lembrados'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import dynamic from 'next/dynamic'

const CashFlowChart = dynamic(() => import('./cash-flow-chart').then(m => ({ default: m.CashFlowChart })), {
  loading: () => <div className="min-h-[300px] animate-pulse rounded-xl bg-gray-100" />,
  ssr: false,
})
import { CashFlowBreakdown } from './cash-flow-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RawTransaction {
  id?: string
  date: string
  amountCents: number
  type: string
  accountId: string
  description?: string
  categoryName?: string | null
}

interface PreparedTransaction extends RawTransaction {
  dateKey: string
  month: string
}

interface AccountOption {
  id: string
  name: string
  titular?: string | null
}

type ViewMode = 'realized' | 'projected' | 'both'

// Filtros e gráfico sobrevivem à troca de tela. Período de atalho fica
// relativo (`periodKey`) e volta com as datas do dia da volta, como em Transações.
const PREFS_KEY = 'fluxo-de-caixa:preferencias'
interface Prefs {
  chartType: ChartType
  showLabels: boolean
  hideTransfers: boolean
  viewMode: ViewMode
  accountIds: string[]
  periodKey: PeriodKey | null
  startDate: string
  endDate: string
}

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
  const [showLabels, setShowLabels] = useState(false)

  const [carregado, setCarregado] = useState(false)

  // Lido depois de montar: no servidor não há localStorage e o HTML divergiria.
  useEffect(() => {
    try {
      const p: Partial<Prefs> = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
      if (p.chartType) setChartType(p.chartType)
      if (typeof p.showLabels === 'boolean') setShowLabels(p.showLabels)
      if (typeof p.hideTransfers === 'boolean') setHideTransfers(p.hideTransfers)
      if (p.viewMode && p.viewMode in VIEW_LABELS) setViewMode(p.viewMode)
      // Conta excluída desde a última visita sairia filtrando nada.
      if (Array.isArray(p.accountIds)) setAccountIds(p.accountIds.filter((id) => accounts.some((a) => a.id === id)))
      if (p.periodKey) setPeriodo(getPeriodDates(p.periodKey))
      else if (typeof p.startDate === 'string' && typeof p.endDate === 'string') {
        setPeriodo({ startDate: p.startDate, endDate: p.endDate })
      }
    } catch { /* sem preferência salva, fica o padrão */ }
    setCarregado(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, [])

  // Só grava depois de ler, senão o padrão apagaria o que estava salvo.
  useEffect(() => {
    if (!carregado) return
    const prefs: Prefs = {
      chartType, showLabels, hideTransfers, viewMode, accountIds,
      periodKey: detectActivePeriod(startDate, endDate), startDate, endDate,
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch { /* navegador sem storage: vale só nesta visita */ }
  }, [carregado, chartType, showLabels, hideTransfers, viewMode, accountIds, startDate, endDate])

  const preparedTransactions = useMemo(() => preparar(transactions), [transactions])
  const preparedFutureTransactions = useMemo(() => preparar(futureTransactions), [futureTransactions])

  // Período, conta e transferências valem para cards, gráfico e detalhamento.
  // Data vazia é ponta aberta, como em Transações ("Todo o período").
  // Transferência à mostra conta pelo sinal: entrada na conta é receita, saída é despesa.
  const filtrar = useMemo(() => (list: PreparedTransaction[]) => list.filter((t) =>
    (!hideTransfers || t.type !== 'transfer')
    && (accountIds.length === 0 || accountIds.includes(t.accountId))
    && (!startDate || t.dateKey >= startDate)
    && (!endDate || t.dateKey <= endDate),
  ).map((t) => (t.type === 'transfer' ? { ...t, type: t.amountCents >= 0 ? 'income' : 'expense' } : t)),
  [hideTransfers, accountIds, startDate, endDate])

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

  // O caminho inverso: período que para em hoje não tem previsão nenhuma, e
  // o que começa hoje não tem realizado. Trocar a visão estica o período.
  function trocarVisao(mode: ViewMode) {
    setViewMode(mode)
    const hoje = hojeEmSaoPaulo()
    const futuro = getPeriodDates('next6Months', hoje)
    const passado = getPeriodDates('last12Months', hoje)
    const soPassado = Boolean(endDate) && endDate <= hoje
    const soFuturo = Boolean(startDate) && startDate >= hoje
    if (mode === 'projected' && soPassado) setPeriodo(futuro)
    else if (mode === 'realized' && soFuturo) setPeriodo(passado)
    // "Ambos" precisa dos dois lados de hoje; vindo de Projetado, o período só tinha futuro.
    else if (mode === 'both' && (soPassado || soFuturo)) {
      setPeriodo({
        startDate: soFuturo ? passado.startDate : startDate,
        endDate: soPassado ? futuro.endDate : endDate,
      })
    }
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
              onClick={() => trocarVisao(mode)}
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
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {/* Bolinha na cor da série do gráfico; o valor fica na cor do texto. */}
            <span className="h-2 w-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" />
            Receitas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {/* Bolinha na cor da série do gráfico; o valor fica na cor do texto. */}
            <span className="h-2 w-2 rounded-full bg-[#eb6834] dark:bg-[#d95926]" />
            Despesas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(totalExpense)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Saldo {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className={`mt-2 text-xl font-bold ${totalNet >= 0 ? 'text-foreground' : 'text-red-600'}`}>
            {formatBRL(totalNet)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Média Mensal</p>
          <p className={`mt-2 text-xl font-bold ${avgMonthlyNet >= 0 ? 'text-foreground' : 'text-red-600'}`}>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CashFlowChartPicker activeType={chartType} onChange={setChartType} />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded border-gray-300"
              />
              Mostrar valores
            </label>
          </div>
          {chartData.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nenhuma transação encontrada para o período selecionado.
            </div>
          ) : (
            <CashFlowChart data={chartData} chartType={chartType} viewMode={viewMode} showLabels={showLabels} />
          )}
        </CardContent>
      </Card>

      {/* Breakdown */}
      <CashFlowBreakdown transactions={deferredActiveTransactions} />
    </>
  )
}
