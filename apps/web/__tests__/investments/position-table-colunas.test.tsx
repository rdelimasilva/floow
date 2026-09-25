import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/investments/actions', () => ({ updateAssetPrice: vi.fn(), deleteAsset: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/investments/price-history-panel', () => ({ PriceHistoryPanel: () => null }))

const { PositionTable } = await import('@/components/investments/position-table')

/**
 * A tabela de posições tinha 12 colunas em qualquer largura. Classe e
 * Dividendos só aparecem em tela larga (xl) — e cabeçalho, linhas e rodapé
 * têm de esconder as mesmas colunas, senão os totais saem desalinhados.
 */
const posicao = {
  assetId: 'a1', ticker: 'PETR4', name: 'Petrobras', assetClass: 'stock_br',
  quantityHeld: 1, avgCostCents: 1000, totalCostCents: 1000, currentPriceCents: 1100,
  currentValueCents: 1100, unrealizedPnLPercent: 10, unrealizedPnLCents: 100,
  realizedPnLCents: 0, totalDividendsCents: 50, source: 'manual' as const, costIsPartial: false,
}

const escondidaAteXl = (el: Element) => el.className.includes('hidden') && el.className.includes('xl:table-cell')

function colunasVisiveisAbaixoDeXl(linha: Element) {
  return [...linha.children].filter((c) => !escondidaAteXl(c)).reduce((n, c) => n + ((c as HTMLTableCellElement).colSpan || 1), 0)
}

describe('PositionTable — colunas', () => {
  it('Classe e Dividendos só aparecem em tela larga', () => {
    const { container } = render(<PositionTable positions={[posicao]} orgId="org-1" />)
    const titulos = [...container.querySelectorAll('thead th')].filter(escondidaAteXl).map((th) => th.textContent)
    expect(titulos).toEqual(['Classe', 'Dividendos'])
  })

  it('cabeçalho, linha e rodapé somam as mesmas colunas abaixo de xl', () => {
    const { container } = render(<PositionTable positions={[posicao]} orgId="org-1" />)
    const cabecalho = container.querySelector('thead tr')!
    const linha = container.querySelector('tbody tr')!
    const rodape = container.querySelector('tfoot tr')!
    const n = colunasVisiveisAbaixoDeXl(cabecalho)
    expect(colunasVisiveisAbaixoDeXl(linha)).toBe(n)
    expect(colunasVisiveisAbaixoDeXl(rodape)).toBe(n)
  })
})
