'use client'

import { PieChart, Pie, Cell } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance'
import type { EnrichedPosition } from '@/lib/investments/queries'

// Color palette per asset class
const ASSET_CLASS_COLORS: Record<string, string> = {
  br_equity: '#2563eb',
  fii: '#7c3aed',
  etf: '#059669',
  crypto: '#d97706',
  fixed_income: '#0891b2',
  international: '#dc2626',
}

// Portuguese labels per asset class
const ASSET_CLASS_LABELS: Record<string, string> = {
  br_equity: 'Ações BR',
  fii: 'FIIs',
  etf: 'ETFs',
  crypto: 'Cripto',
  fixed_income: 'Renda Fixa',
  international: 'Internacional',
}

const chartConfig = {
  br_equity: { label: 'Ações BR', color: '#2563eb' },
  fii: { label: 'FIIs', color: '#7c3aed' },
  etf: { label: 'ETFs', color: '#059669' },
  crypto: { label: 'Cripto', color: '#d97706' },
  fixed_income: { label: 'Renda Fixa', color: '#0891b2' },
  international: { label: 'Internacional', color: '#dc2626' },
}

interface AllocationChartProps {
  positions: EnrichedPosition[]
}

/**
 * AllocationChart — renders a Recharts PieChart showing portfolio allocation by asset class.
 *
 * Groups positions by assetClass, sums currentValueCents per class, and renders
 * each slice with its corresponding color from ASSET_CLASS_COLORS.
 *
 * CRITICAL: ChartContainer requires min-h-[N] Tailwind class — without it the chart
 * renders with 0px height (invisible). See Pitfall 2 in 03-RESEARCH.md.
 */
export function AllocationChart({ positions }: AllocationChartProps) {
  // Group positions by asset class, summing currentValueCents
  const classMap = new Map<string, number>()
  for (const pos of positions) {
    const current = classMap.get(pos.assetClass) ?? 0
    classMap.set(pos.assetClass, current + pos.currentValueCents)
  }

  const data = Array.from(classMap.entries()).map(([assetClass, valueCents]) => ({
    assetClass,
    label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
    valueCents,
  }))

  if (data.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhuma posição disponível para exibir alocação.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <PieChart>
        <Pie
          data={data}
          dataKey="valueCents"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius={120}
          label={({ label, percent }) =>
            `${label}: ${((percent ?? 0) * 100).toFixed(1)}%`
          }
        >
          {data.map((entry) => (
            <Cell
              key={entry.assetClass}
              fill={ASSET_CLASS_COLORS[entry.assetClass] ?? '#6b7280'}
            />
          ))}
        </Pie>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatBRL(value as number)}
            />
          }
        />
      </PieChart>
    </ChartContainer>
  )
}
