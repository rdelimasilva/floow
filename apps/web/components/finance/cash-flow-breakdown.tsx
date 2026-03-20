'use client'

import { useState } from 'react'
import { formatBRL } from '@floow/core-finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CashFlowMonthData {
  month: string
  income: number
  expense: number
  net: number
}

interface DailyTransaction {
  date: string
  amountCents: number
  type: string
  description: string
}

interface CashFlowBreakdownProps {
  monthlyData: CashFlowMonthData[]
  dailyTransactions: DailyTransaction[]
  totalIncome: number
  totalExpense: number
}

interface DailyRow {
  date: string
  label: string
  income: number
  expense: number
  net: number
}

function aggregateDaily(transactions: DailyTransaction[]): DailyRow[] {
  const dayMap = new Map<string, { income: number; expense: number }>()

  for (const tx of transactions) {
    const dateKey = typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date
    const existing = dayMap.get(dateKey) ?? { income: 0, expense: 0 }
    if (tx.type === 'income') {
      existing.income += tx.amountCents
    } else if (tx.type === 'expense') {
      existing.expense += tx.amountCents
    }
    dayMap.set(dateKey, existing)
  }

  return Array.from(dayMap.entries())
    .map(([date, { income, expense }]) => {
      const d = new Date(date + 'T12:00:00')
      return {
        date,
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        income,
        expense,
        net: income + expense,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function CashFlowBreakdown({ monthlyData, dailyTransactions, totalIncome, totalExpense }: CashFlowBreakdownProps) {
  const [view, setView] = useState<'monthly' | 'daily'>('monthly')
  const dailyData = view === 'daily' ? aggregateDaily(dailyTransactions) : []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Detalhamento</CardTitle>
          <div className="flex rounded-lg border border-gray-200 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setView('monthly')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === 'monthly' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setView('daily')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === 'daily' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Diário
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {view === 'monthly' ? 'Mês' : 'Data'}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {view === 'monthly' ? (
                monthlyData.map((d) => {
                  const [year, month] = d.month.split('-')
                  const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                  return (
                    <tr key={d.month} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-600 capitalize">{label}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-green-700">{formatBRL(d.income)}</td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-red-600">{formatBRL(Math.abs(d.expense))}</td>
                      <td className={`px-4 py-2 text-right text-sm font-bold ${d.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatBRL(d.net)}
                      </td>
                    </tr>
                  )
                })
              ) : (
                dailyData.map((d) => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-600">{d.label}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-green-700">{d.income > 0 ? formatBRL(d.income) : '—'}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-red-600">{d.expense < 0 ? formatBRL(Math.abs(d.expense)) : '—'}</td>
                    <td className={`px-4 py-2 text-right text-sm font-bold ${d.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatBRL(d.net)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-2 text-sm font-medium text-gray-700">Total</td>
                <td className="px-4 py-2 text-right text-sm font-bold text-green-700">{formatBRL(totalIncome)}</td>
                <td className="px-4 py-2 text-right text-sm font-bold text-red-600">{formatBRL(totalExpense)}</td>
                <td className={`px-4 py-2 text-right text-sm font-bold ${totalIncome - totalExpense >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatBRL(totalIncome - totalExpense)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
