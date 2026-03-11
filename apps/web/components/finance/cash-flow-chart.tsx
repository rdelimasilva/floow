'use client'

import { BarChart, Bar, XAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { CashFlowMonth } from '@floow/core-finance'

const chartConfig = {
  income: {
    label: 'Receitas',
    color: '#16a34a',
  },
  expense: {
    label: 'Despesas',
    color: '#dc2626',
  },
}

interface CashFlowChartProps {
  data: CashFlowMonth[]
}

/**
 * CashFlowChart renders a Recharts BarChart showing monthly income vs. expense
 * using the shadcn/ui ChartContainer wrapper (FIN-04).
 *
 * CRITICAL: ChartContainer requires min-h-[N] Tailwind class — without it the
 * chart renders with 0px height (invisible). See Pitfall 7 in 02-RESEARCH.md.
 *
 * Used by: dashboard (Plan 02-04) and transactions page preview.
 */
export function CashFlowChart({ data }: CashFlowChartProps) {
  if (data.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhum dado de fluxo de caixa disponivel.
      </div>
    )
  }

  // Recharts expects expense as a positive number for bar display;
  // we negate it here so both bars render above the X axis
  const chartData = data.map((month) => ({
    month: month.month,
    income: month.income,
    expense: Math.abs(month.expense),
    net: month.net,
  }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
