import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

const A = '11111111-1111-4111-8111-111111111111'
const replace = vi.fn()
const gravarRecorte = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(`accountId=${A}`),
}))
vi.mock('@/lib/finance/recorte', async (orig) => ({ ...(await orig<object>()), gravarRecorte }))
vi.mock('@/lib/investments/actions', () => ({ updateAssetPrice: vi.fn(), deleteAsset: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/investments/price-history-panel', () => ({ PriceHistoryPanel: () => null }))

const { PositionTable } = await import('@/components/investments/position-table')
const { MostrarEncerrados } = await import('@/components/investments/mostrar-encerrados')

const base = {
  assetClass: 'credit_fixed_income', quantityHeld: 9, avgCostCents: 1000, totalCostCents: 1000,
  currentPriceCents: 1100, currentValueCents: 1100, unrealizedPnLCents: 100, unrealizedPnLPercent: 10,
  realizedPnLCents: 0, totalDividendsCents: 0, source: 'openfinance' as const, costIsPartial: false,
}

describe('conta escolhida em Investimentos', () => {
  it('o link do ativo leva o accountId', () => {
    const { container } = render(
      <PositionTable positions={[{ ...base, assetId: 'a1', ticker: 'XPML11', name: 'XP Malls' }]} orgId="o" accountId={A} />,
    )
    const hrefs = [...container.querySelectorAll('a')].map((l) => l.getAttribute('href'))
    expect(hrefs).toContain(`/investments/a1?accountId=${A}`)
  })

  it('filtro da carteira mantém a conta e não grava o recorte', () => {
    render(<MostrarEncerrados quantidade={2} ativo={false} />)
    fireEvent.click(screen.getByRole('button'))
    expect(replace).toHaveBeenCalledWith(`/investments?accountId=${A}&encerrados=1`, { scroll: false })
    expect(gravarRecorte).not.toHaveBeenCalled()
  })
})
