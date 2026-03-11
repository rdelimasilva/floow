'use client'

import { LineChart, Line, XAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance'
import type { PatrimonySnapshot } from '@floow/db'

const chartConfig = {
  netWorthCents: {
    label: 'Patrimonio Liquido',
    color: '#2563eb',
  },
}

interface NetWorthEvolutionProps {
  snapshots: PatrimonySnapshot[]
}

/**
 * NetWorthEvolution — renders a Recharts LineChart showing patrimony snapshot history (DASH-03).
 *
 * Accepts an array of PatrimonySnapshot rows (already sorted ascending by snapshotDate
 * via getPatrimonySnapshots query). Maps each snapshot to { date, netWorthCents } for the chart.
 *
 * CRITICAL: ChartContainer requires min-h-[N] Tailwind class — without it the chart
 * renders with 0px height (invisible).
 */
export function NetWorthEvolution({ snapshots }: NetWorthEvolutionProps) {
  if (snapshots.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhum dado patrimonial disponivel.
      </div>
    )
  }

  const chartData = snapshots.map((s) => {
    const date = s.snapshotDate instanceof Date ? s.snapshotDate : new Date(s.snapshotDate as unknown as string)
    return {
      date: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      netWorthCents: s.netWorthCents,
    }
  })

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
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
        <Line
          type="monotone"
          dataKey="netWorthCents"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
