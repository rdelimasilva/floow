import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * Revisão de 18/10/2026: ativo sem ticker (CDB, CRI, Tesouro do banco) punha
 * o nome inteiro em monoespaçado na coluna Código, quebrando em 4–5 linhas.
 * Sem ticker, Código fica com "—" e o nome vai só na coluna Nome.
 */

vi.mock('@/lib/investments/actions', () => ({ updateAssetPrice: vi.fn(), deleteAsset: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/investments/price-history-panel', () => ({ PriceHistoryPanel: () => null }))

const { PositionTable } = await import('@/components/investments/position-table')

const base = {
  assetClass: 'credit_fixed_income', quantityHeld: 9, avgCostCents: 1000, totalCostCents: 1000,
  currentPriceCents: 1100, currentValueCents: 1100, unrealizedPnLCents: 100, unrealizedPnLPercent: 10,
  realizedPnLCents: 0, totalDividendsCents: 0, source: 'openfinance' as const, costIsPartial: false,
}

function celulas(container: HTMLElement) {
  const [codigo, nome] = [...container.querySelectorAll('tbody tr:first-child td')]
  return { codigo, nome }
}

describe('PositionTable — coluna Código', () => {
  it('ativo sem ticker mostra "—" no Código e o nome completo no Nome', () => {
    const nome = "CRI REDE D'OR 100% IPCA · venc. 08/2033"
    const { container } = render(<PositionTable positions={[{ ...base, assetId: 'a1', ticker: nome, name: nome }]} orgId="org-1" />)
    const { codigo, nome: celulaNome } = celulas(container)
    expect(codigo.textContent).toMatch(/^—/)
    expect(codigo.textContent).not.toContain('CRI')
    expect(celulaNome.textContent).toBe(nome)
    expect(celulaNome.getAttribute('title')).toBe(nome)
  })

  it('ativo com ticker segue com o ticker no Código', () => {
    const { container } = render(<PositionTable positions={[{ ...base, assetId: 'a2', ticker: 'PETR4', name: 'Petrobras', source: 'manual' }]} orgId="org-1" />)
    const { codigo } = celulas(container)
    expect(codigo.textContent).toMatch(/^PETR4/)
  })
})
