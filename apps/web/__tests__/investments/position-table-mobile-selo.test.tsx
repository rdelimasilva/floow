import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O card do celular tem de mostrar os mesmos selos da linha da tabela —
 * senão, no celular, ativo do banco parece manual.
 */

vi.mock('@/lib/investments/actions', () => ({ updateAssetPrice: vi.fn(), deleteAsset: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/investments/price-history-panel', () => ({ PriceHistoryPanel: () => null }))

const { PositionTable } = await import('@/components/investments/position-table')

const posicao = {
  assetId: 'a1', ticker: 'CDB X', name: 'CDB X', assetClass: 'credit_fixed_income',
  quantityHeld: 1, avgCostCents: 1000, totalCostCents: 1000, currentPriceCents: 1100,
  currentValueCents: 1100, unrealizedPnLCents: 100, unrealizedPnLPercent: 10,
  realizedPnLCents: 0, totalDividendsCents: 0, source: 'openfinance' as const, costIsPartial: true,
}

describe('PositionTable — selos no card do celular', () => {
  it('card e linha mostram Open Finance e Custo parcial', () => {
    render(React.createElement(PositionTable, { positions: [posicao], orgId: 'org-1' }))
    // Card (md:hidden) + linha (desktop) — o jsdom renderiza os dois.
    expect(screen.getAllByText('Open Finance')).toHaveLength(2)
    expect(screen.getAllByText('Custo parcial')).toHaveLength(2)
  })
})
