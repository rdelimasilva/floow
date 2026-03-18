'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { WithdrawalYearPoint } from '@floow/core-finance/src/withdrawal'

const chartConfig = {
  portfolioCents: {
    label: 'Patrimônio',
    color: '#2563eb',
  },
}

interface DepletionChartProps {
  data: WithdrawalYearPoint[]
  mode: 'fixed' | 'percentage'
}

/**
 * DepletionChart — renders a line chart showing portfolio value during withdrawal phase.
 *
 * In fixed mode, shows the portfolio declining to zero (with a depletion reference line).
 * In percentage mode, shows a sustainable withdrawal curve (portfolio stays positive).
 *
 * X-axis: age. Y-axis: portfolio value in BRL.
 */
export function DepletionChart({ data, mode }: DepletionChartProps) {
  if (data.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Configure os parâmetros para visualizar a simulação.
      </div>
    )
  }

  const depletionPoint = data.find((p) => p.depleted)
  const depletionAge = depletionPoint?.age ?? null

  const chartData = data.map((p) => ({
    age: p.age,
    portfolioCents: p.portfolioCents,
    withdrawalCents: p.withdrawalCents,
  }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="age"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Idade', position: 'insideBottom', offset: -4, fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(v) => formatBRL(v as number)}
          tickLine={false}
          axisLine={false}
          width={80}
          tick={{ fontSize: 10 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                if (name === 'portfolioCents') {
                  return [`${formatBRL(value as number)}`, 'Patrimônio']
                }
                return [`${formatBRL(value as number)}`, 'Retirada Anual']
              }}
            />
          }
        />
        {depletionAge !== null && (
          <ReferenceLine
            x={depletionAge}
            stroke="#dc2626"
            strokeDasharray="4 4"
            label={{
              value: `Patrimônio esgota (${depletionAge})`,
              position: 'top',
              fontSize: 11,
              fill: '#dc2626',
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="portfolioCents"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
