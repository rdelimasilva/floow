'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const chartConfig = {
  value: {
    label: 'Valor Estimado',
    color: '#3b82f6',
  },
}

interface MonthlyPoint {
  month: string
  label: string
  valueCents: number
}

interface AssetValueHistoryProps {
  data: MonthlyPoint[]
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function AssetValueHistory({ data }: AssetValueHistoryProps) {
  if (data.length === 0) return null

  const chartData = data.map((d) => ({
    month: d.label,
    value: d.valueCents / 100,
  }))

  return (
    <div className="space-y-4">
      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Evolução do Valor</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatBRL(Number(value) * 100)}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f620"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Histórico Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto">
            <table className="min-w-full">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Mês</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Valor Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...data].reverse().map((d) => (
                  <tr key={d.month}>
                    <td className="px-3 py-2 text-sm text-gray-600">{d.label}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-foreground">{formatBRL(d.valueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
