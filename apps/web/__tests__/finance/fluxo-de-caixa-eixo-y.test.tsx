/**
 * Gráfico do Fluxo de Caixa sem eixo Y (revisão de 18/10/2026): as barras não
 * tinham nenhum valor de referência. Todo gráfico cartesiano precisa do eixo,
 * com os centavos formatados em reais compactos.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const wrap = vi.hoisted(() => (id: string) => ({ children }: { children: React.ReactNode }) =>
  React.createElement('div', { 'data-testid': id }, children))

vi.mock('recharts', () => ({
  BarChart: wrap('bar-chart'),
  LineChart: wrap('line-chart'),
  AreaChart: wrap('area-chart'),
  PieChart: wrap('pie-chart'),
  ComposedChart: wrap('composed-chart'),
  ResponsiveContainer: wrap('rc'),
  Bar: () => null,
  Line: () => null,
  Area: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) =>
    React.createElement('span', { 'data-testid': 'eixo-y' }, tickFormatter ? tickFormatter(1_000_000) : ''),
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
  LabelList: () => null,
}))

vi.mock('@/components/ui/chart', () => ({
  ChartContainer: wrap('chart'),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}))

import { CashFlowChart } from '@/components/finance/cash-flow-chart'

const data = [
  { month: '2026-09', income: 1_000_000, expense: -400_000, net: 600_000 },
  { month: '2026-10', income: 800_000, expense: -900_000, net: -100_000 },
]

describe('eixo Y do gráfico do fluxo de caixa', () => {
  it.each(['bar', 'stacked', 'line', 'area', 'waterfall'] as const)(
    'gráfico "%s" tem eixo Y em reais',
    (chartType) => {
      render(<CashFlowChart data={data} chartType={chartType} />)
      const eixo = screen.getByTestId('eixo-y')
      // 1.000.000 centavos = R$ 10 mil
      expect(eixo.textContent).toMatch(/R\$\s?10\s?mil/)
    },
  )
})
