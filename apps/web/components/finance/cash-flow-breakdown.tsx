'use client'

import { Fragment, useState, useMemo, useDeferredValue } from 'react'
import { formatBRL } from '@floow/core-finance/src/balance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CashFlowLancamentoDialog } from './cash-flow-lancamento-dialog'

type Grouping = 'daily' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'

interface RawTransaction {
  id?: string
  date: string
  dateKey?: string
  amountCents: number
  type: string
  accountId: string
  description?: string
  categoryName?: string | null
}

/** Célula aberta: os lançamentos daquele período e daquele lado. */
interface Aberta { key: string; type: 'income' | 'expense' }

interface AggregatedRow {
  key: string
  label: string
  income: number
  expense: number
  net: number
}

interface CashFlowBreakdownProps {
  transactions: RawTransaction[]
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
      // "outubro de 2026" -> "Outubro de 2026". A classe CSS `capitalize`
      // subia todas as palavras ("Outubro De 2026").
      const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      return label.charAt(0).toUpperCase() + label.slice(1)
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

export function CashFlowBreakdown({ transactions = [] }: CashFlowBreakdownProps) {
  const [grouping, setGrouping] = useState<Grouping>('monthly')
  const [aberta, setAberta] = useState<Aberta | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

  const deferredTransactions = useDeferredValue(transactions)

  const rows = useMemo(() => aggregate(deferredTransactions, grouping), [deferredTransactions, grouping])

  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpense = rows.reduce((s, r) => s + Math.abs(r.expense), 0)
  const totalNet = totalIncome - totalExpense

  // Os mesmos lançamentos que formaram a soma da célula, do mais recente ao mais antigo.
  const lancamentos = useMemo(() => {
    if (!aberta) return []
    return deferredTransactions
      .filter((t) => t.type === aberta.type && getGroupKey(t.date, grouping) === aberta.key)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [aberta, deferredTransactions, grouping])

  function alternar(key: string, type: Aberta['type']) {
    setAberta(aberta?.key === key && aberta.type === type ? null : { key, type })
  }

  // Valor clicável: abre ou fecha a lista logo abaixo da linha.
  function celula(r: AggregatedRow, type: Aberta['type']) {
    const valor = type === 'income' ? Math.max(r.income, 0) : Math.max(-r.expense, 0)
    if (!valor) return '—'
    const ativa = aberta?.key === r.key && aberta.type === type
    return (
      <button
        type="button"
        aria-expanded={ativa}
        onClick={() => alternar(r.key, type)}
        className={`rounded px-1 underline-offset-2 hover:underline ${ativa ? 'underline' : ''}`}
      >
        {formatBRL(valor)}
      </button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <CardTitle className="text-sm">Detalhamento</CardTitle>

          {/* Grouping toggle */}
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-gray-200 p-0.5 gap-0.5 w-fit">
            {(Object.keys(GROUPING_LABELS) as Grouping[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => { setGrouping(g); setAberta(null) }}
                className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
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
            <table className="min-w-full">
              <thead className="bg-gray-50">
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
                  <Fragment key={r.key}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-600">{r.label}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-green-700">{celula(r, 'income')}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-red-600">{celula(r, 'expense')}</td>
                      <td className={`px-4 py-2 text-right text-sm font-bold ${r.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatBRL(r.net)}
                      </td>
                    </tr>
                    {aberta?.key === r.key && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={4} className="px-4 py-2">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {aberta.type === 'income' ? 'Receitas' : 'Despesas'} de {r.label} · {lancamentos.length} lançamento{lancamentos.length === 1 ? '' : 's'}
                          </p>
                          <ul className="divide-y divide-gray-100 text-sm">
                            {lancamentos.map((t, i) => (
                              <li key={t.id ?? i}>
                                <button
                                  type="button"
                                  disabled={!t.id}
                                  onClick={() => t.id && setDetalhe(t.id)}
                                  className="flex w-full items-baseline gap-3 rounded py-1.5 text-left hover:bg-gray-100"
                                >
                                <span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">
                                  {(t.dateKey ?? t.date).slice(8, 10)}/{(t.dateKey ?? t.date).slice(5, 7)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-gray-700">{t.description || 'Sem descrição'}</span>
                                {t.categoryName && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{t.categoryName}</span>}
                                <span className="shrink-0 tabular-nums font-medium text-gray-900">{formatBRL(Math.abs(t.amountCents))}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
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
        )}
      </CardContent>
      <CashFlowLancamentoDialog id={detalhe} onClose={() => setDetalhe(null)} />
    </Card>
  )
}
