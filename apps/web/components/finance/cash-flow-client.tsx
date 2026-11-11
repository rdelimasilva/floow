'use client'

import { useState, useMemo, useDeferredValue, useEffect } from 'react'
import { useFiltrosNaUrl } from './filtros/use-filtros-na-url'
import { GavetaDeFiltros } from './filtros/gaveta-de-filtros'
import { useGravarRecorteNaChegada } from './filtros/use-gravar-recorte-na-chegada'
import { visaoInicial, type ViewMode } from '@/lib/finance/visao-do-fluxo'
import { formatBRL } from '@floow/core-finance/src/balance'
import { SeletorDePeriodo } from './filtros/seletor-de-periodo'
import { AccountFilter } from './account-filter'
import { PILULA_BASE, PILULA_OFF, PILULA_ON } from './filtros/pilula'
import { PERIOD_GROUPS, getPeriodDates, hojeEmSaoPaulo, type PeriodKey } from '@/lib/finance/filtros-lembrados'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import dynamic from 'next/dynamic'

const CashFlowChart = dynamic(() => import('./cash-flow-chart').then(m => ({ default: m.CashFlowChart })), {
  loading: () => <div className="min-h-[300px] animate-pulse rounded-xl bg-gray-100" />,
  ssr: false,
})
import { CashFlowBreakdown } from './cash-flow-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { aplicadoEmInvestimentos } from '@/lib/finance/aplicado-em-investimentos'

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
  type?: string
}

// Gráfico e visão sobrevivem à troca de tela. Período e contas moram na URL e
// no recorte compartilhado (cookie), não aqui.
const PREFS_KEY = 'fluxo-de-caixa:preferencias'
interface Prefs {
  chartType: ChartType
  showLabels: boolean
  hideTransfers: boolean
  viewMode: ViewMode
}

const VIEW_LABELS: Record<ViewMode, string> = {
  realized: 'Realizado',
  projected: 'Projetado',
  both: 'Ambos',
}

interface CashFlowClientProps {
  transactions: RawTransaction[]
  futureTransactions: RawTransaction[]
  accounts: AccountOption[]
  /** Recorte vindo da URL; data vazia é ponta aberta. */
  startDate: string
  endDate: string
  accountIds: string[]
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

export function CashFlowClient({ transactions, futureTransactions, accounts, startDate, endDate, accountIds }: CashFlowClientProps) {
  const { trocar } = useFiltrosNaUrl('/cash-flow')
  useGravarRecorteNaChegada(accounts)
  const [chartType, setChartType] = useState<ChartType>('bar')
  // Só o clique do usuário muda a preferência; a visão mostrada deriva dela e do período.
  const [prefVisao, setPrefVisao] = useState<ViewMode>('realized')
  const viewMode = visaoInicial(prefVisao, startDate, endDate, hojeEmSaoPaulo())
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
      if (p.viewMode && p.viewMode in VIEW_LABELS) setPrefVisao(p.viewMode)
    } catch { /* sem preferência salva, fica o padrão */ }
    setCarregado(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, [])

  // Só grava depois de ler, senão o padrão apagaria o que estava salvo.
  useEffect(() => {
    if (!carregado) return
    const prefs: Prefs = { chartType, showLabels, hideTransfers, viewMode: prefVisao }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch { /* navegador sem storage: vale só nesta visita */ }
  }, [carregado, chartType, showLabels, hideTransfers, prefVisao])

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

  function escolherPeriodo(p: { startDate: string; endDate: string }, key: PeriodKey | null) {
    // Atalho de passado ou de futuro é escolha explícita e leva ao modo que tem dado para ele;
    // seta e datas à mão só mudam a visão mostrada (`visaoInicial`), não a preferência.
    if (key && PERIOD_GROUPS[0].keys.includes(key)) setPrefVisao('realized')
    else if (key && PERIOD_GROUPS[2].keys.includes(key)) setPrefVisao('projected')
    trocar({ startDate: p.startDate, endDate: p.endDate })
  }

  // O caminho inverso: período que para em hoje não tem previsão nenhuma, e
  // o que começa hoje não tem realizado. Trocar a visão estica o período e,
  // como é um clique, grava o novo período no recorte.
  function trocarVisao(mode: ViewMode) {
    setPrefVisao(mode)
    const hoje = hojeEmSaoPaulo()
    const futuro = getPeriodDates('next6Months', hoje)
    const passado = getPeriodDates('last12Months', hoje)
    const soPassado = Boolean(endDate) && endDate <= hoje
    const soFuturo = Boolean(startDate) && startDate >= hoje
    if (mode === 'projected' && soPassado) trocar(futuro)
    else if (mode === 'realized' && soFuturo) trocar(passado)
    // "Ambos" precisa dos dois lados de hoje; vindo de Projetado, o período só tinha futuro.
    else if (mode === 'both' && (soPassado || soFuturo)) {
      trocar({
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

  // Aplicação em investimento é transferência: com elas ocultas, sai do saldo.
  // Mostrar o valor separa o que foi guardado do que foi gasto.
  const aplicado = useMemo(() => {
    const contas = new Set(accounts.filter((a) => a.type === 'brokerage').map((a) => a.id))
    const lista = viewMode === 'realized' ? preparedTransactions
      : viewMode === 'projected' ? preparedFutureTransactions
        : [...preparedTransactions, ...preparedFutureTransactions]
    return aplicadoEmInvestimentos(lista.filter((t) =>
      (accountIds.length === 0 || accountIds.includes(t.accountId))
      && (!startDate || t.dateKey >= startDate)
      && (!endDate || t.dateKey <= endDate),
    ), contas)
  }, [accounts, viewMode, preparedTransactions, preparedFutureTransactions, accountIds, startDate, endDate])

  const opcoes = (naGaveta: boolean) => (
    <>
      <AccountFilter accounts={accounts} selected={accountIds} onChange={(ids) => trocar({ accountId: ids.join(',') })} naGaveta={naGaveta} />
      {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          onClick={() => trocarVisao(mode)}
          className={`${PILULA_BASE} ${viewMode === mode ? PILULA_ON : PILULA_OFF}`}
        >
          {VIEW_LABELS[mode]}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={hideTransfers}
        onClick={() => setHideTransfers((v) => !v)}
        className={`${PILULA_BASE} ${hideTransfers ? PILULA_ON : PILULA_OFF}`}
      >
        Ocultar transferências
      </button>
    </>
  )

  return (
    <>
      {/* Preso logo abaixo do cabeçalho fixo, no computador. */}
      <div className="space-y-1.5 bg-gray-50 md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top)+var(--altura-cabecalho,0px))] md:z-20 md:pb-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Celular: período e setas à vista; contas e visão na gaveta. */}
          <SeletorDePeriodo
            modo="intervalo"
            startDate={startDate}
            endDate={endDate}
            aoMudar={escolherPeriodo}
            acaoNoCelular={
              <GavetaDeFiltros contador={[accountIds.length > 0, viewMode !== 'realized', !hideTransfers].filter(Boolean).length}>
                <div className="space-y-4">{opcoes(true)}</div>
              </GavetaDeFiltros>
            }
          />
          <div className="hidden md:contents">{opcoes(false)}</div>
        </div>
        {futureTransactions.length === 0 && (
          <p className="text-xs text-gray-500">
            Sem lançamentos futuros (crie transações recorrentes para projetar)
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {/* Bolinha na cor da série do gráfico; o valor fica na cor do texto. */}
            <span className="h-2 w-2 rounded-full bg-[#2a78d6]" />
            Receitas {viewMode === 'projected' ? '(projetado)' : ''}
          </p>
          <p className="mt-2 text-xl font-bold text-foreground">{formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {/* Bolinha na cor da série do gráfico; o valor fica na cor do texto. */}
            <span className="h-2 w-2 rounded-full bg-[#eb6834]" />
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
          <p className="mt-1 text-xs text-muted-foreground">
            {hideTransfers ? 'Não inclui transferências entre contas' : 'Inclui transferências entre contas'}
          </p>
          {hideTransfers && aplicado > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fora do saldo: {formatBRL(aplicado)} aplicados em investimentos
            </p>
          )}
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
      <CashFlowBreakdown
        transactions={deferredActiveTransactions}
        recorte={{ startDate, endDate, accountIds, visao: viewMode, ocultarTransferencias: hideTransfers }}
      />
    </>
  )
}
