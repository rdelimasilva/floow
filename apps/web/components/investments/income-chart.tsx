'use client'

import { BarChart, Bar, XAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { IncomeMonth } from '@floow/core-finance/src/income'
import { formatarDia } from '@/lib/formatar-dia'

const chartConfig = {
  dividendCents: {
    label: 'Dividendos',
    color: '#059669',
  },
  interestCents: {
    label: 'Juros',
    color: '#2563eb',
  },
  amortizationCents: {
    label: 'Amortização',
    color: '#d97706',
  },
}

interface IncomeChartProps {
  /** Monthly income data from lastIncomeMonths() — sorted descending (most recent first).
   *  We reverse it here for chronological left-to-right chart display. */
  incomeData: IncomeMonth[]
}

/**
 * IncomeChart — renders a stacked Recharts BarChart showing monthly passive income breakdown.
 *
 * Stacked bars: dividendCents (green), interestCents (blue), amortizationCents (amber).
 * The incomeData array is sorted descending from lastIncomeMonths(); we reverse for asc display.
 *
 * CRITICAL: ChartContainer requires min-h-[N] Tailwind class — without it the chart
 * renders with 0px height (invisible).
 */
export function IncomeChart({ incomeData }: IncomeChartProps) {
  if (incomeData.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhum dado de renda disponível.
      </div>
    )
  }

  // Reverse to show oldest-to-newest left-to-right (lastIncomeMonths returns newest first)
  const chartData = [...incomeData].reverse().map((m) => ({
    month: rotuloDoMes(m.month),
    dividendCents: m.dividendCents,
    interestCents: m.interestCents,
    amortizationCents: m.amortizationCents,
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
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatBRL(value as number)}
            />
          }
        />
        <Bar
          dataKey="dividendCents"
          stackId="income"
          fill="#059669"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="interestCents"
          stackId="income"
          fill="#2563eb"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="amortizationCents"
          stackId="income"
          fill="#d97706"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}

/** 'YYYY-MM' -> 'nov. de 25', o mesmo formato da Evolução Patrimonial. */
export function rotuloDoMes(mes: string): string {
  return formatarDia(`${mes}-01T00:00:00Z`, { month: 'short', year: '2-digit' })
}
