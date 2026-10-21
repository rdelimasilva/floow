/**
 * RTL tests for dashboard components.
 *
 * The dashboard itself is a React Server Component (RSC) and cannot be rendered
 * directly by @testing-library/react. Instead we test the client sub-components
 * that the dashboard renders:
 *   - AccountSummaryRow (renders per-account cards with name and balance)
 *   - QuickStatsRow (renders Receitas do Mes, Despesas do Mes, Saldo do Mes)
 *   - PatrimonySummary (renders net worth, blocks and "Atualizar valores" button)
 *   - CashFlowChart (renders with data-testid="cash-flow-chart")
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mock recharts and chart components (avoid canvas issues in jsdom) ──────
// Espelha todos os símbolos que cash-flow-chart.tsx importa de recharts.
// Um símbolo faltando aqui quebra o teste com "No <X> export is defined on the
// recharts mock" — foi o que aconteceu quando Legend foi adicionado ao gráfico.
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Bar: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, children),
  Line: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'area-chart' }, children),
  Area: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'pie-chart' }, children),
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ComposedChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'composed-chart' }, children),
  ReferenceLine: () => null,
  LabelList: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}))

vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'cash-flow-chart', className },
      children
    ),
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}))

// ── Import the components after mocking ────────────────────────────────────
import { AccountSummaryRow } from '@/components/finance/account-summary-row'
import { QuickStatsRow } from '@/components/finance/quick-stats-row'
import { PatrimonySummary } from '@/components/finance/patrimony-summary'
import { CashFlowChart } from '@/components/finance/cash-flow-chart'
import type { Account } from '@floow/db'
import type { CashFlowMonth } from '@floow/core-finance'

// ── Test data ──────────────────────────────────────────────────────────────

const mockAccounts: Account[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    orgId: 'org-test',
    name: 'Nubank',
    type: 'checking',
    branch: null,
    accountNumber: null,
    balanceCents: 380000,
    currency: 'BRL',
    isActive: true,
    closingDay: null,
    dueDay: null,
    titular: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    orgId: 'org-test',
    name: 'Poupanca',
    type: 'savings',
    branch: null,
    accountNumber: null,
    balanceCents: 100000,
    currency: 'BRL',
    isActive: true,
    closingDay: null,
    dueDay: null,
    titular: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockCashFlow: CashFlowMonth[] = [
  { month: '2026-03', income: 500000, expense: -20000, net: 480000 },
  { month: '2026-02', income: 480000, expense: -18000, net: 462000 },
]

const mockPatrimonio = {
  patrimonioLiquidoCents: 480000,
  ativosCents: 480000,
  passivosCents: 0,
  blocos: [{ key: 'correntes', titulo: 'Contas correntes', valorCents: 480000 }],
}

// ── Tests: AccountSummaryRow ───────────────────────────────────────────────

describe('AccountSummaryRow', () => {
  it('renders a card for each account with name and formatted balance', () => {
    render(<AccountSummaryRow accounts={mockAccounts} />)

    expect(screen.getByText('Nubank')).toBeDefined()
    expect(screen.getByText('Poupanca')).toBeDefined()

    // Formatted BRL balances (R$ 3.800,00 and R$ 1.000,00)
    expect(screen.getByText(/3\.800/)).toBeDefined()
    expect(screen.getByText(/1\.000/)).toBeDefined()
  })

  it('conta de investimento do Open Finance mostra o valor das posições, como a tela Contas', () => {
    // Revisão de 18/10/2026: o Dashboard mostrava o saldo de lançamentos
    // (Inv. Itaú R$ 104.858, XP R$ 0) e Contas as posições (R$ 1.905 e R$ 650.824).
    const corretora = { ...mockAccounts[0], id: 'inv-xp', name: 'Investimentos · XP', type: 'brokerage' as const, balanceCents: 0 }
    render(<AccountSummaryRow accounts={[corretora]} valorDasPosicoes={new Map([['inv-xp', 65082488]])} />)

    expect(screen.getByText(/650\.824,88/)).toBeDefined()
  })

  it('shows empty state CTA when no accounts', () => {
    render(<AccountSummaryRow accounts={[]} />)

    expect(screen.getByText(/primeira conta/i)).toBeDefined()
  })
})

// ── Tests: QuickStatsRow ───────────────────────────────────────────────────

describe('QuickStatsRow', () => {
  it('renders all three stat labels', () => {
    render(
      <QuickStatsRow
        incomeCents={500000}
        expenseCents={-20000}
        netCents={480000}
      />
    )

    expect(screen.getByText(/Receitas do M[eê]s/i)).toBeDefined()
    expect(screen.getByText(/Despesas do M[eê]s/i)).toBeDefined()
    expect(screen.getByText(/Saldo do M[eê]s/i)).toBeDefined()
  })
})

// ── Tests: PatrimonySummary ────────────────────────────────────────────────

describe('PatrimonySummary', () => {
  it('renders net worth and refresh button', () => {
    const onRefresh = vi.fn()
    render(<PatrimonySummary patrimonio={mockPatrimonio} onRefresh={onRefresh} />)

    // Net worth 480000 cents = R$ 4.800,00 — use getAllByText since it appears in multiple places
    const elements = screen.getAllByText(/4\.800/)
    expect(elements.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Atualizar valores/i })).toBeDefined()
  })

  it('detalha pelos blocos em português, com cartão negativo', () => {
    render(
      <PatrimonySummary
        patrimonio={{
          patrimonioLiquidoCents: 66434639,
          ativosCents: 66942480,
          passivosCents: 507841,
          blocos: [
            { key: 'correntes', titulo: 'Contas correntes', valorCents: 1669490 },
            { key: 'investimentos', titulo: 'Investimentos', valorCents: 65272990 },
            { key: 'cartoes', titulo: 'Cartões', valorCents: -507841 },
          ],
        }}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('Contas correntes')).toBeDefined()
    expect(screen.getByText('Investimentos')).toBeDefined()
    expect(screen.getByText('Cartões')).toBeDefined()
    expect(screen.queryByText('investments')).toBeNull()
    expect(screen.getByText(/664\.346,39/)).toBeDefined()
    expect(screen.getByText(/-R\$\s?5\.078,41/)).toBeDefined()
  })
})

// ── Tests: CashFlowChart ───────────────────────────────────────────────────

describe('CashFlowChart', () => {
  it('renders chart container when data exists', () => {
    render(<CashFlowChart data={mockCashFlow} />)

    expect(screen.getByTestId('cash-flow-chart')).toBeDefined()
  })
})
