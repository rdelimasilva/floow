/**
 * RTL tests for dashboard components.
 *
 * The dashboard itself is a React Server Component (RSC) and cannot be rendered
 * directly by @testing-library/react. Instead we test the client sub-components
 * that the dashboard renders:
 *   - AccountSummaryRow (renders per-account cards with name and balance)
 *   - QuickStatsRow (renders Receitas do Mes, Despesas do Mes, Saldo do Mes)
 *   - PatrimonySummary (renders net worth and "Atualizar Snapshot" button)
 *   - CashFlowChart (renders with data-testid="cash-flow-chart")
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mock recharts and chart components (avoid canvas issues in jsdom) ──────
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Bar: () => null,
  XAxis: () => null,
  CartesianGrid: () => null,
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
    balanceCents: 380000,
    currency: 'BRL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    orgId: 'org-test',
    name: 'Poupanca',
    type: 'savings',
    balanceCents: 100000,
    currency: 'BRL',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const mockCashFlow: CashFlowMonth[] = [
  { month: '2026-03', income: 500000, expense: -20000, net: 480000 },
  { month: '2026-02', income: 480000, expense: -18000, net: 462000 },
]

const mockSnapshot = {
  id: 'snap-001',
  orgId: 'org-test',
  snapshotDate: new Date('2026-03-11'),
  netWorthCents: 480000,
  liquidAssetsCents: 480000,
  liabilitiesCents: 0,
  breakdown: JSON.stringify({ checking: 380000, savings: 100000 }),
  createdAt: new Date(),
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
  it('renders net worth and update snapshot button when snapshot exists', () => {
    const onRefresh = vi.fn()
    render(<PatrimonySummary snapshot={mockSnapshot} onRefresh={onRefresh} />)

    // Net worth 480000 cents = R$ 4.800,00 — use getAllByText since it appears in multiple places
    const elements = screen.getAllByText(/4\.800/)
    expect(elements.length).toBeGreaterThan(0)
    // Button should be present
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('shows no snapshot message and refresh button when snapshot is null', () => {
    const onRefresh = vi.fn()
    render(<PatrimonySummary snapshot={null} onRefresh={onRefresh} />)

    // Null snapshot shows a message about needing to calculate patrimony
    expect(screen.getAllByText(/Atualizar Snapshot/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button')).toBeDefined()
  })
})

// ── Tests: CashFlowChart ───────────────────────────────────────────────────

describe('CashFlowChart', () => {
  it('renders chart container when data exists', () => {
    render(<CashFlowChart data={mockCashFlow} />)

    expect(screen.getByTestId('cash-flow-chart')).toBeDefined()
  })
})
