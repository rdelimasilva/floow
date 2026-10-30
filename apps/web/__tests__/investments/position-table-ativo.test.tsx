import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * Revisão de 18/10/2026: ativo sem ticker (CDB, CRI, Tesouro do banco) punha
 * o nome inteiro em monoespaçado na coluna Código, quebrando em 4–5 linhas.
 * Revisão de 29/10/2026: a coluna Código saiu (vazia na maioria das posições
 * e empurrava Ações para fora da tela). O ticker, quando existe, vai em cima
 * do nome na coluna Ativo.
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

function celulaAtivo(container: HTMLElement) {
  return container.querySelector('tbody tr:first-child td')!
}

describe('PositionTable — coluna Ativo', () => {
  it('ativo sem ticker mostra só o nome, sem repetir', () => {
    const nome = "CRI REDE D'OR 100% IPCA · venc. 08/2033"
    const { container } = render(<PositionTable positions={[{ ...base, assetId: 'a1', ticker: nome, name: nome }]} orgId="org-1" />)
    const celula = celulaAtivo(container)
    expect(celula.firstElementChild?.textContent).toBe(nome)
    expect(celula.textContent?.split(nome).length).toBe(2)
    expect(celula.getAttribute('title')).toBe(nome)
  })

  it('ativo com ticker mostra o ticker, o nome e os selos', () => {
    const { container } = render(<PositionTable positions={[{ ...base, assetId: 'a3', ticker: 'XPML11', name: 'XP Malls', costIsPartial: true }]} orgId="org-1" />)
    const celula = celulaAtivo(container)
    expect(celula.firstElementChild?.textContent).toBe('XPML11')
    expect(celula.textContent).toContain('XP Malls')
    expect(celula.textContent).toContain('Open Finance')
    expect(celula.textContent).toContain('Custo parcial')
  })
})
