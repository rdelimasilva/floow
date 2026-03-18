'use client'

import { useMemo } from 'react'
import { LineChart, Line, XAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { RetirementYearPoint } from '@floow/core-finance/src/simulation'

const chartConfig = {
  conservative: {
    label: 'Conservador',
    color: '#dc2626',
  },
  base: {
    label: 'Base',
    color: '#2563eb',
  },
  aggressive: {
    label: 'Arrojado',
    color: '#16a34a',
  },
}

interface RetirementSimulationChartProps {
  conservative: RetirementYearPoint[]
  base: RetirementYearPoint[]
  aggressive: RetirementYearPoint[]
  retirementAge: number
  currentAge: number
  showNominal: boolean
  inflationRate: number
}

/**
 * RetirementSimulationChart — renders a multi-line Recharts LineChart with 3 scenario projections.
 *
 * Data is keyed by age (x-axis). Each scenario has its own line.
 * If showNominal is true, values are inflated to nominal (future) terms.
 * A vertical ReferenceLine marks the retirement age.
 */
export function RetirementSimulationChart({
  conservative,
  base,
  aggressive,
  retirementAge,
  currentAge,
  showNominal,
  inflationRate,
}: RetirementSimulationChartProps) {
  const chartData = useMemo(() => {
    // Build a map of age -> all three scenario values
    const ageMap = new Map<
      number,
      { age: number; conservative: number; base: number; aggressive: number }
    >()

    for (const point of base) {
      ageMap.set(point.age, {
        age: point.age,
        conservative: 0,
        base: 0,
        aggressive: 0,
      })
    }

    function applyNominal(cents: number, age: number): number {
      if (!showNominal) return cents
      const years = age - currentAge
      return Math.round(cents * Math.pow(1 + inflationRate, years))
    }

    for (const point of conservative) {
      const entry = ageMap.get(point.age)
      if (entry) entry.conservative = applyNominal(point.portfolioCents, point.age)
    }
    for (const point of base) {
      const entry = ageMap.get(point.age)
      if (entry) entry.base = applyNominal(point.portfolioCents, point.age)
    }
    for (const point of aggressive) {
      const entry = ageMap.get(point.age)
      if (entry) entry.aggressive = applyNominal(point.portfolioCents, point.age)
    }

    return Array.from(ageMap.values()).sort((a, b) => a.age - b.age)
  }, [conservative, base, aggressive, showNominal, inflationRate, currentAge])

  if (chartData.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Preencha os dados do formulario para ver a projecao.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[350px] w-full">
      <LineChart data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="age"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          label={{ value: 'Idade', position: 'insideBottom', offset: -5 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatBRL((value as number) / 100)}
              labelFormatter={(label) => `Idade ${label}`}
            />
          }
        />
        <ReferenceLine
          x={retirementAge}
          stroke="#6b7280"
          strokeDasharray="4 4"
          label={{ value: 'Aposentadoria', position: 'top', fontSize: 11, fill: '#6b7280' }}
        />
        <Line
          type="monotone"
          dataKey="conservative"
          stroke={chartConfig.conservative.color}
          strokeWidth={2}
          dot={false}
          name="Conservador"
        />
        <Line
          type="monotone"
          dataKey="base"
          stroke={chartConfig.base.color}
          strokeWidth={2}
          dot={false}
          name="Base"
        />
        <Line
          type="monotone"
          dataKey="aggressive"
          stroke={chartConfig.aggressive.color}
          strokeWidth={2}
          dot={false}
          name="Arrojado"
        />
      </LineChart>
    </ChartContainer>
  )
}
