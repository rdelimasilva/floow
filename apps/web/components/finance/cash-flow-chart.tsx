'use client'

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { CashFlowMonth } from '@floow/core-finance'
import { formatBRL } from '@floow/core-finance'
import type { ChartType } from './cash-flow-chart-picker'

const chartConfig = {
  income: { label: 'Receitas', color: '#16a34a' },
  expense: { label: 'Despesas', color: '#dc2626' },
  net: { label: 'Saldo', color: '#2563eb' },
  projectedIncome: { label: 'Receitas (proj.)', color: '#86efac' },
  projectedExpense: { label: 'Despesas (proj.)', color: '#fca5a5' },
}

interface CashFlowChartProps {
  data: any[]
  chartType?: ChartType
  viewMode?: 'realized' | 'projected' | 'both'
}

export function CashFlowChart({ data, chartType = 'bar', viewMode = 'realized' }: CashFlowChartProps) {
  if (data.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhum dado de fluxo de caixa disponível.
      </div>
    )
  }

  const chartData = data.map((month) => ({
    month: month.month,
    income: month.income,
    expense: Math.abs(month.expense),
    net: month.net,
  }))

  // Waterfall: compute cumulative balance
  const waterfallData = (() => {
    let cumulative = 0
    return chartData.map((d) => {
      const base = cumulative
      const delta = d.income - d.expense
      cumulative += delta
      return { ...d, base, delta, cumulative }
    })
  })()

  // Pie: totals for the period
  const pieTotals = chartData.reduce(
    (acc, d) => ({ income: acc.income + d.income, expense: acc.expense + d.expense }),
    { income: 0, expense: 0 }
  )

  const legendFormatter = (value: string) => {
    const labels: Record<string, string> = {
      income: 'Receitas',
      expense: 'Despesas',
      net: 'Saldo',
      projectedIncome: 'Receitas (proj.)',
      projectedExpense: 'Despesas (proj.)',
      delta: 'Variação',
    }
    return labels[value] ?? value
  }

  if (chartType === 'pie') {
    const pieData = [
      { name: 'Receitas', value: pieTotals.income, color: '#16a34a' },
      { name: 'Despesas', value: pieTotals.expense, color: '#dc2626' },
    ]
    const netValue = pieTotals.income - pieTotals.expense
    return (
      <div className="min-h-[300px] w-full flex flex-col items-center justify-center">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              dataKey="value"
              label={({ name, value }) => `${name}: ${formatBRL(value)}`}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatBRL(value)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <p className={`text-sm font-semibold ${netValue >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          Saldo: {formatBRL(netValue)}
        </p>
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      {chartType === 'bar' ? (
        <BarChart data={viewMode === 'both' ? data : chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="net" fill="var(--color-net)" radius={[4, 4, 0, 0]} />
          {viewMode === 'both' && (
            <>
              <Bar dataKey="projectedIncome" fill="var(--color-projectedIncome)" radius={[4, 4, 0, 0]} fillOpacity={0.5} />
              <Bar dataKey="projectedExpense" fill="var(--color-projectedExpense)" radius={[4, 4, 0, 0]} fillOpacity={0.5} />
            </>
          )}
        </BarChart>
      ) : chartType === 'stacked' ? (
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Bar dataKey="income" stackId="stack" fill="var(--color-income)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="expense" stackId="stack" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : chartType === 'line' ? (
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Area type="monotone" dataKey="income" fill="var(--color-income)" fillOpacity={0.3} stroke="var(--color-income)" strokeWidth={2} />
          <Area type="monotone" dataKey="expense" fill="var(--color-expense)" fillOpacity={0.3} stroke="var(--color-expense)" strokeWidth={2} />
          <Area type="monotone" dataKey="net" fill="var(--color-net)" fillOpacity={0.15} stroke="var(--color-net)" strokeWidth={2} strokeDasharray="4 4" />
        </AreaChart>
      ) : chartType === 'waterfall' ? (
        <BarChart data={waterfallData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" legendType="none" />
          <Bar dataKey="delta" stackId="waterfall" radius={[4, 4, 0, 0]}>
            {waterfallData.map((entry, i) => (
              <Cell key={i} fill={entry.delta >= 0 ? '#16a34a' : '#dc2626'} />
            ))}
          </Bar>
        </BarChart>
      ) : (
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend formatter={legendFormatter} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="net" fill="var(--color-net)" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ChartContainer>
  )
}
