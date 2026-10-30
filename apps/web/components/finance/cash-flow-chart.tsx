'use client'

import {
  Bar, Line, Area, ComposedChart, LineChart, AreaChart, BarChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Legend, ReferenceLine, LabelList,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { formatBRL } from '@floow/core-finance/src/balance'
import type { ChartType } from './cash-flow-chart-picker'
import { nomeDoMes } from '@/lib/finance/nome-do-mes'

/** Centavos -> "R$ 10 mil": referência curta para o eixo Y. */
const yAxisFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  // Sem o mínimo explícito, ICU antigo (Node 20) herda as 2 casas da moeda: "R$ 10,0 mil"
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

function formatYAxisTick(cents: number): string {
  return yAxisFormatter.format(cents / 100)
}

function formatMonthTick(value: string): string {
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

function formatMonthLong(value: string): string {
  return nomeDoMes(value)
}

// Azul e laranja: opostos que se separam também para daltônicos (verde e
// vermelho não). O vermelho fica livre para alerta. O saldo é o resultado,
// não uma terceira categoria, então vai na cor do texto.
const COLORS = {
  income: 'var(--color-income)',
  expense: 'var(--color-expense)',
  net: 'hsl(var(--foreground))',
}

const LABELS: Record<string, string> = {
  income: 'Receitas',
  expense: 'Despesas',
  net: 'Saldo',
  projectedIncome: 'Receitas previstas',
  projectedExpense: 'Despesas previstas',
  faixa: 'Variação',
}

/** Bolinha das legendas fora do gráfico, onde as variáveis --color-* não chegam. */
export const SWATCH = {
  income: 'bg-[#2a78d6]',
  expense: 'bg-[#eb6834]',
}

// Os tons do modo escuro são outros passos da mesma escala, validados contra o fundo escuro.
const chartConfig = {
  income: { label: LABELS.income, theme: { light: '#2a78d6', dark: '#3987e5' } },
  expense: { label: LABELS.expense, theme: { light: '#eb6834', dark: '#d95926' } },
  net: { label: LABELS.net },
}

// O previsto é o mesmo tom do realizado, mais claro: a cor diz o que é, a
// opacidade diz se já aconteceu.
const PROJECTED_OPACITY = 0.4
// Contorno na cor do fundo: separa os segmentos empilhados e o ponto da linha.
const SURFACE = 'hsl(var(--card))'

const BAR = { maxBarSize: 24, radius: [4, 4, 0, 0] as [number, number, number, number] }

interface MonthRow {
  month: string
  income: number
  expense: number
  net: number
  projectedIncome?: number
  projectedExpense?: number
  projectedNet?: number
}

interface CashFlowChartProps {
  data: MonthRow[]
  chartType?: ChartType
  viewMode?: 'realized' | 'projected' | 'both'
  /** Valor escrito em cada barra ou ponto, sem precisar passar o mouse. */
  showLabels?: boolean
}

/** Tooltip do mês em reais; o padrão mostrava os centavos crus. */
function MonthTooltip({ active, payload, label }: TooltipProps<number | number[], string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-foreground">{formatMonthLong(String(label))}</p>
      <div className="space-y-1">
        {payload.map((item) => {
          // Série com dataKey em função (despesa negativa, saldo somado) se identifica pelo `name`.
          const key = typeof item.dataKey === 'function' ? String(item.name) : String(item.dataKey)
          const raw = item.value
          const value = Array.isArray(raw) ? raw[1] - raw[0]
            : key === 'expense' ? Math.abs(Number(raw ?? 0)) : Number(raw ?? 0)
          if (key.startsWith('projected') && !value) return null
          const color = key === 'faixa'
            ? (value >= 0 ? COLORS.income : COLORS.expense)
            : (item.color ?? COLORS.net)
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color, opacity: key.startsWith('projected') ? PROJECTED_OPACITY : 1 }}
                />
                {LABELS[key] ?? key}
              </span>
              <span className="font-medium tabular-nums text-foreground">{formatBRL(value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const legendText = (value: string) => (
  <span className="text-xs text-muted-foreground">{LABELS[value] ?? value}</span>
)

/** Eixos, grade e legenda iguais em todos os tipos. Array porque o Recharts só enxerga filhos diretos. */
function frame(legend = true) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="hsl(var(--border))" />,
    <XAxis key="x" dataKey="month" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={formatMonthTick} minTickGap={12} />,
    <YAxis key="y" tickLine={false} axisLine={false} width={72} tickFormatter={formatYAxisTick} />,
    <ReferenceLine key="zero" y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.4} />,
    <ChartTooltip key="tip" cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} content={<MonthTooltip />} />,
    legend && <Legend key="legend" iconType="circle" iconSize={8} formatter={legendText} wrapperStyle={{ paddingTop: 12 }} />,
  ]
}

// Entrada do rótulo: Recharts passa o retângulo ou ponto com o mês em `payload`.
type LabelEntry = { value?: number; payload: MonthRow & { faixa?: [number, number] } }

/** Valor fixo na ponta da marca, no formato curto do eixo ("R$ 1,2 mil"); zero fica sem rótulo. */
function rotulo(show: boolean, position: 'top' | 'bottom' = 'top', valueAccessor?: (e: LabelEntry) => number) {
  if (!show) return null
  return (
    <LabelList
      position={position} offset={6} fontSize={10} fill="hsl(var(--muted-foreground))"
      valueAccessor={valueAccessor}
      formatter={(v: number) => (v ? formatYAxisTick(v) : '')}
    />
  )
}

function netLine(show: boolean) {
  return (
    <Line
      type="monotone" dataKey="net" stroke={COLORS.net} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round"
      dot={{ r: 4, fill: COLORS.net, stroke: SURFACE, strokeWidth: 2 }}
      activeDot={{ r: 5, fill: COLORS.net, stroke: SURFACE, strokeWidth: 2 }}
    >
      {rotulo(show)}
    </Line>
  )
}

export function CashFlowChart({ data, chartType = 'bar', viewMode = 'realized', showLabels = false }: CashFlowChartProps) {
  if (data.length === 0) {
    return (
      <div className="min-h-[300px] w-full flex items-center justify-center text-sm text-gray-500">
        Nenhum dado de fluxo de caixa disponível.
      </div>
    )
  }

  // Em "Ambos", só as barras desenham o projetado à parte; os outros tipos somam
  // realizado e projetado, senão o previsto sumia do gráfico.
  const chartData = data.map((month) => ({
    month: month.month,
    income: month.income + (month.projectedIncome ?? 0),
    expense: Math.abs(month.expense) + (month.projectedExpense ?? 0),
    net: month.net + (month.projectedNet ?? 0),
  }))

  if (chartType === 'pie') {
    const totals = chartData.reduce(
      (acc, d) => ({ income: acc.income + d.income, expense: acc.expense + d.expense }),
      { income: 0, expense: 0 },
    )
    const pieData = [
      { key: 'income', value: totals.income },
      { key: 'expense', value: totals.expense },
    ]
    const netValue = totals.income - totals.expense
    return (
      <div className="flex min-h-[300px] w-full flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-10">
        <div className="relative h-[240px] w-[240px]">
          <ChartContainer config={chartConfig} className="aspect-square h-full w-full">
            <PieChart>
              <Pie
                data={pieData} dataKey="value" nameKey="key"
                innerRadius={78} outerRadius={110} paddingAngle={2} cornerRadius={4}
                stroke={SURFACE} strokeWidth={2} startAngle={90} endAngle={-270}
              >
                {pieData.map((entry) => <Cell key={entry.key} fill={COLORS[entry.key as 'income' | 'expense']} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">Saldo</span>
            <span className="text-lg font-semibold text-foreground">{formatBRL(netValue)}</span>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {pieData.map((entry) => (
            <div key={entry.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${SWATCH[entry.key as 'income' | 'expense']}`} />
              <span className="text-muted-foreground">{LABELS[entry.key]}</span>
              <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">{formatBRL(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const container = 'aspect-auto h-[320px] w-full'

  if (chartType === 'line') {
    return (
      <ChartContainer config={chartConfig} className={container}>
        <LineChart data={chartData}>
          {frame()}
          <Line type="monotone" dataKey="income" stroke={COLORS.income} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>{rotulo(showLabels)}</Line>
          <Line type="monotone" dataKey="expense" stroke={COLORS.expense} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>{rotulo(showLabels)}</Line>
          {netLine(showLabels)}
        </LineChart>
      </ChartContainer>
    )
  }

  if (chartType === 'area') {
    return (
      <ChartContainer config={chartConfig} className={container}>
        <AreaChart data={chartData}>
          {frame()}
          <Area type="monotone" dataKey="income" fill={COLORS.income} fillOpacity={0.1} stroke={COLORS.income} strokeWidth={2} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>{rotulo(showLabels)}</Area>
          <Area type="monotone" dataKey="expense" fill={COLORS.expense} fillOpacity={0.1} stroke={COLORS.expense} strokeWidth={2} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>{rotulo(showLabels)}</Area>
          <Area type="monotone" dataKey="net" fill={COLORS.net} fillOpacity={0.1} stroke={COLORS.net} strokeWidth={2} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>{rotulo(showLabels)}</Area>
        </AreaChart>
      </ChartContainer>
    )
  }

  if (chartType === 'stacked') {
    return (
      <ChartContainer config={chartConfig} className={container}>
        <BarChart data={chartData} stackOffset="sign">
          {frame()}
          <Bar dataKey="income" stackId="s" fill={COLORS.income} maxBarSize={24} radius={[4, 4, 0, 0]} stroke={SURFACE} strokeWidth={1}>{rotulo(showLabels)}</Bar>
          {/* Despesa abaixo do zero: o empilhado mostra entrada contra saída no mesmo mês. */}
          <Bar dataKey={(d: MonthRow) => -d.expense} name="expense" stackId="s" fill={COLORS.expense} maxBarSize={24} radius={[0, 0, 4, 4]} stroke={SURFACE} strokeWidth={1}>
            {rotulo(showLabels, 'bottom', (e) => e.payload.expense)}
          </Bar>
        </BarChart>
      </ChartContainer>
    )
  }

  if (chartType === 'waterfall') {
    // Cada barra vai do saldo acumulado anterior ao novo, como faixa [início, fim].
    let cumulative = 0
    const waterfallData = chartData.map((d) => {
      const start = cumulative
      cumulative += d.income - d.expense
      return { month: d.month, faixa: [start, cumulative] as [number, number] }
    })
    return (
      <ChartContainer config={chartConfig} className={container}>
        <BarChart data={waterfallData}>
          {frame(false)}
          <Bar dataKey="faixa" maxBarSize={24} radius={4}>
            {waterfallData.map((entry) => (
              <Cell key={entry.month} fill={entry.faixa[1] >= entry.faixa[0] ? COLORS.income : COLORS.expense} />
            ))}
            {/* O Recharts entrega ao rótulo só a ponta da faixa; a variação do mês vem do payload. */}
            {rotulo(showLabels, 'top', (e) => (e.payload.faixa ? e.payload.faixa[1] - e.payload.faixa[0] : 0))}
          </Bar>
        </BarChart>
      </ChartContainer>
    )
  }

  // Barras: receitas e despesas lado a lado, saldo como linha por cima.
  const both = viewMode === 'both'
  const barData = both
    ? data.map((d) => ({ ...d, expense: Math.abs(d.expense) }))
    : chartData
  return (
    <ChartContainer config={chartConfig} className={container}>
      <ComposedChart data={barData} barGap={2} barCategoryGap="24%">
        {frame()}
        <Bar dataKey="income" stackId={both ? 'in' : undefined} fill={COLORS.income} {...BAR} stroke={both ? SURFACE : undefined} strokeWidth={both ? 1 : 0}>
          {!both && rotulo(showLabels)}
        </Bar>
        {/* Em "Ambos" o rótulo vai no topo da pilha e mostra o total do mês. */}
        {both && (
          <Bar dataKey="projectedIncome" stackId="in" fill={COLORS.income} fillOpacity={PROJECTED_OPACITY} {...BAR} stroke={SURFACE} strokeWidth={1}>
            {rotulo(showLabels, 'top', (e) => e.payload.income + (e.payload.projectedIncome ?? 0))}
          </Bar>
        )}
        <Bar dataKey="expense" stackId={both ? 'out' : undefined} fill={COLORS.expense} {...BAR} stroke={both ? SURFACE : undefined} strokeWidth={both ? 1 : 0}>
          {!both && rotulo(showLabels)}
        </Bar>
        {both && (
          <Bar dataKey="projectedExpense" stackId="out" fill={COLORS.expense} fillOpacity={PROJECTED_OPACITY} {...BAR} stroke={SURFACE} strokeWidth={1}>
            {rotulo(showLabels, 'top', (e) => e.payload.expense + (e.payload.projectedExpense ?? 0))}
          </Bar>
        )}
        {both
          ? <Line type="monotone" dataKey={(d: MonthRow) => d.net + (d.projectedNet ?? 0)} name="net" stroke={COLORS.net} strokeWidth={2} dot={{ r: 4, fill: COLORS.net, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }}>
              {rotulo(showLabels)}
            </Line>
          : netLine(showLabels)}
      </ComposedChart>
    </ChartContainer>
  )
}
