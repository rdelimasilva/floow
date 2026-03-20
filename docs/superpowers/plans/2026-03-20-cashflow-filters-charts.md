# Cash Flow Filters & Chart Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add period filters and 6 chart type options to the cash flow page.

**Architecture:** A client wrapper component manages period and chart type state. Period filter computes date ranges and filters data client-side from the full 24-month dataset fetched server-side. Chart component switches rendering based on `chartType` prop using Recharts.

**Tech Stack:** Next.js App Router, Recharts, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-20-cashflow-filters-charts-design.md`

---

## File Structure

### New files
- `apps/web/components/finance/cash-flow-period-filter.tsx` — period shortcut buttons
- `apps/web/components/finance/cash-flow-chart-picker.tsx` — mini cards for chart type
- `apps/web/components/finance/cash-flow-client.tsx` — client wrapper managing state

### Modified files
- `apps/web/components/finance/cash-flow-chart.tsx` — accept `chartType`, render 6 chart types
- `apps/web/app/(app)/cash-flow/page.tsx` — fetch 24 months, use client wrapper

---

## Task 1: Period filter component

**Files:**
- Create: `apps/web/components/finance/cash-flow-period-filter.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { useState } from 'react'

type PeriodKey = 'today' | 'month' | 'quarter' | 'semester' | 'year' | 'last3' | 'last6' | 'last12'

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  month: 'Este mês',
  quarter: 'Este trimestre',
  semester: 'Este semestre',
  year: 'Este ano',
  last3: 'Últimos 3m',
  last6: 'Últimos 6m',
  last12: 'Últimos 12m',
}

function getPeriodDates(key: PeriodKey): { startDate: string; endDate: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const endToday = fmt(now)

  switch (key) {
    case 'today':
      return { startDate: endToday, endDate: endToday }
    case 'month':
      return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(new Date(y, m + 1, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3)
      return { startDate: fmt(new Date(y, q * 3, 1)), endDate: fmt(new Date(y, q * 3 + 3, 0)) }
    }
    case 'semester': {
      const s = m < 6 ? 0 : 1
      return { startDate: fmt(new Date(y, s * 6, 1)), endDate: fmt(new Date(y, s * 6 + 6, 0)) }
    }
    case 'year':
      return { startDate: fmt(new Date(y, 0, 1)), endDate: fmt(new Date(y, 11, 31)) }
    case 'last3': {
      const d = new Date(y, m - 3, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
    case 'last6': {
      const d = new Date(y, m - 6, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
    case 'last12': {
      const d = new Date(y, m - 12, now.getDate())
      return { startDate: fmt(d), endDate: endToday }
    }
  }
}

interface CashFlowPeriodFilterProps {
  activePeriod: PeriodKey
  onChange: (period: PeriodKey, startDate: string, endDate: string) => void
}

export type { PeriodKey }
export { getPeriodDates }

export function CashFlowPeriodFilter({ activePeriod, onChange }: CashFlowPeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            const { startDate, endDate } = getPeriodDates(key)
            onChange(key, startDate, endDate)
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activePeriod === key
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/cash-flow-period-filter.tsx
git commit -m "feat: create cash flow period filter component"
```

---

## Task 2: Chart type picker component

**Files:**
- Create: `apps/web/components/finance/cash-flow-chart-picker.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client'

import { BarChart3, LineChart, AreaChart, TrendingUp, PieChart } from 'lucide-react'

export type ChartType = 'bar' | 'stacked' | 'line' | 'area' | 'waterfall' | 'pie'

const CHART_OPTIONS: { type: ChartType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'bar', label: 'Barras', Icon: BarChart3 },
  { type: 'stacked', label: 'Empilhado', Icon: BarChart3 },
  { type: 'line', label: 'Linha', Icon: LineChart },
  { type: 'area', label: 'Área', Icon: AreaChart },
  { type: 'waterfall', label: 'Cascata', Icon: TrendingUp },
  { type: 'pie', label: 'Pizza', Icon: PieChart },
]

interface CashFlowChartPickerProps {
  activeType: ChartType
  onChange: (type: ChartType) => void
}

export function CashFlowChartPicker({ activeType, onChange }: CashFlowChartPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHART_OPTIONS.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            activeType === type
              ? 'border border-blue-500 bg-blue-50 text-blue-700'
              : 'border border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/cash-flow-chart-picker.tsx
git commit -m "feat: create chart type picker component"
```

---

## Task 3: Expand CashFlowChart to support 6 chart types

**Files:**
- Modify: `apps/web/components/finance/cash-flow-chart.tsx`

- [ ] **Step 1: Rewrite the chart component**

Replace the entire file content with:

```typescript
'use client'

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, CartesianGrid, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { CashFlowMonth } from '@floow/core-finance'
import { formatBRL } from '@floow/core-finance'
import type { ChartType } from './cash-flow-chart-picker'

const chartConfig = {
  income: { label: 'Receitas', color: '#16a34a' },
  expense: { label: 'Despesas', color: '#dc2626' },
  net: { label: 'Saldo', color: '#2563eb' },
}

interface CashFlowChartProps {
  data: CashFlowMonth[]
  chartType?: ChartType
}

export function CashFlowChart({ data, chartType = 'bar' }: CashFlowChartProps) {
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
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : chartType === 'stacked' ? (
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="income" stackId="stack" fill="var(--color-income)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="expense" stackId="stack" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : chartType === 'line' ? (
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="income" stroke="var(--color-income)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="expense" stroke="var(--color-expense)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area type="monotone" dataKey="income" fill="var(--color-income)" fillOpacity={0.3} stroke="var(--color-income)" strokeWidth={2} />
          <Area type="monotone" dataKey="expense" fill="var(--color-expense)" fillOpacity={0.3} stroke="var(--color-expense)" strokeWidth={2} />
        </AreaChart>
      ) : chartType === 'waterfall' ? (
        <BarChart data={waterfallData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          <Bar dataKey="delta" stackId="waterfall" radius={[4, 4, 0, 0]}>
            {waterfallData.map((entry, i) => (
              <Cell key={i} fill={entry.delta >= 0 ? '#16a34a' : '#dc2626'} />
            ))}
          </Bar>
        </BarChart>
      ) : null}
    </ChartContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/cash-flow-chart.tsx
git commit -m "feat: support 6 chart types in CashFlowChart"
```

---

## Task 4: Client wrapper component

**Files:**
- Create: `apps/web/components/finance/cash-flow-client.tsx`

- [ ] **Step 1: Create the client wrapper**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { aggregateCashFlow, formatBRL } from '@floow/core-finance'
import { CashFlowPeriodFilter, getPeriodDates, type PeriodKey } from './cash-flow-period-filter'
import { CashFlowChartPicker, type ChartType } from './cash-flow-chart-picker'
import { CashFlowChart } from './cash-flow-chart'
import { CashFlowBreakdown } from './cash-flow-breakdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RawTransaction {
  date: string
  amountCents: number
  type: string
  accountId: string
}

interface AccountOption {
  id: string
  name: string
}

interface CashFlowClientProps {
  transactions: RawTransaction[]
  accounts: AccountOption[]
}

export function CashFlowClient({ transactions, accounts }: CashFlowClientProps) {
  const [period, setPeriod] = useState<PeriodKey>('last12')
  const [chartType, setChartType] = useState<ChartType>('bar')

  // Get date range for current period
  const { startDate, endDate } = useMemo(() => getPeriodDates(period), [period])

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.date.split('T')[0]
      return d >= startDate && d <= endDate
    })
  }, [transactions, startDate, endDate])

  // Aggregate for chart
  const cashFlowData = useMemo(() => {
    const agg = aggregateCashFlow(filteredTransactions.map((t) => ({
      ...t,
      date: new Date(t.date),
    })))
    return [...agg].reverse() // ascending for chart
  }, [filteredTransactions])

  // Summary stats
  const totalIncome = cashFlowData.reduce((sum, d) => sum + d.income, 0)
  const totalExpense = cashFlowData.reduce((sum, d) => sum + Math.abs(d.expense), 0)
  const totalNet = totalIncome - totalExpense
  const avgMonthlyNet = cashFlowData.length > 0
    ? cashFlowData.reduce((sum, d) => sum + d.net, 0) / cashFlowData.length
    : 0

  return (
    <>
      {/* Period filter */}
      <CashFlowPeriodFilter
        activePeriod={period}
        onChange={(p) => setPeriod(p)}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas</p>
          <p className="mt-2 text-xl font-bold text-green-700">{formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Despesas</p>
          <p className="mt-2 text-xl font-bold text-red-600">{formatBRL(totalExpense)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo</p>
          <p className={`mt-2 text-xl font-bold ${totalNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(totalNet)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Média Mensal</p>
          <p className={`mt-2 text-xl font-bold ${avgMonthlyNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {formatBRL(Math.round(avgMonthlyNet))}
          </p>
        </Card>
      </div>

      {/* Chart type picker + Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CashFlowChartPicker activeType={chartType} onChange={setChartType} />
          {cashFlowData.length === 0 ? (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
              Nenhuma transação encontrada para o período selecionado.
            </div>
          ) : (
            <CashFlowChart data={cashFlowData} chartType={chartType} />
          )}
        </CardContent>
      </Card>

      {/* Breakdown */}
      <CashFlowBreakdown
        transactions={filteredTransactions}
        accounts={accounts}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/finance/cash-flow-client.tsx
git commit -m "feat: create cash flow client wrapper with period and chart state"
```

---

## Task 5: Update cash flow page to use client wrapper

**Files:**
- Modify: `apps/web/app/(app)/cash-flow/page.tsx`

- [ ] **Step 1: Simplify the page**

Replace the entire file with:

```typescript
import { Suspense } from 'react'
import { getOrgId, getRecentTransactions, getAccounts } from '@/lib/finance/queries'
import { CashFlowClient } from '@/components/finance/cash-flow-client'
import { PageHeader } from '@/components/ui/page-header'

async function CashFlowContent({ orgId }: { orgId: string }) {
  const [recentTransactions, accounts] = await Promise.all([
    getRecentTransactions(orgId, 24),
    getAccounts(orgId),
  ])

  const serializedTransactions = recentTransactions.map((t) => ({
    date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
    amountCents: t.amountCents,
    type: t.type,
    accountId: t.accountId,
  }))

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }))

  return (
    <CashFlowClient
      transactions={serializedTransactions}
      accounts={accountOptions}
    />
  )
}

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
}

export default async function CashFlowPage() {
  const orgId = await getOrgId()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fluxo de Caixa"
        description="Receitas, despesas e saldo por período"
      />

      <Suspense fallback={<><SectionSkeleton /><SectionSkeleton /><SectionSkeleton /></>}>
        <CashFlowContent orgId={orgId} />
      </Suspense>
    </div>
  )
}
```

Key changes: fetch 24 months instead of 12, remove inline summary cards and chart (moved to `CashFlowClient`), pass all data to client wrapper.

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(app)/cash-flow/page.tsx
git commit -m "feat: use cash flow client wrapper with period filters and chart picker"
```

---

## Task 6: Verify end-to-end

- [ ] **Step 1: Build check**

Run: `cd apps/web && npx next build --no-lint`
Expected: Build passes

- [ ] **Step 2: Manual test — period filters**

1. Go to /cash-flow
2. Default: "Últimos 12m" active, chart and summary show 12 months
3. Click "Este mês" — chart shows only current month
4. Click "Este ano" — chart shows full year
5. Click "Últimos 3m" — chart shows 3 months

- [ ] **Step 3: Manual test — chart types**

1. Default: "Barras" active
2. Click "Empilhado" — bars stack
3. Click "Linha" — 3 lines (receita, despesa, saldo)
4. Click "Área" — filled areas
5. Click "Cascata" — waterfall with green/red deltas
6. Click "Pizza" — pie with receita vs despesa totals

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during cash flow testing"
```
