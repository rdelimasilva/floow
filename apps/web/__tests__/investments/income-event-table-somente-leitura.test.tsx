import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * Provento de ativo do Open Finance é somente leitura na tela: editar um
 * dividendo/juros pela action manual cria linha em `transactions` (quebra D3,
 * conta em dobro). Então Editar/Excluir só aparecem para ativo manual.
 */

vi.mock('@/lib/investments/actions', () => ({ deletePortfolioEvent: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { IncomeEventTable } = await import('@/components/investments/income-event-table')

const evento = (id: string, source: 'manual' | 'openfinance') => ({
  id,
  assetId: `a-${id}`,
  eventType: 'dividend',
  eventDate: '2026-06-10T00:00:00.000Z',
  totalCents: 1000,
  notes: null,
  ticker: `T-${id}`,
  name: `Ativo ${id}`,
  source,
})

describe('IncomeEventTable', () => {
  it('esconde Editar/Excluir para provento de ativo do Open Finance', () => {
    render(React.createElement(IncomeEventTable, { events: [evento('m', 'manual'), evento('b', 'openfinance')] }))
    const links = screen.getAllByText('Editar')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/investments/events/m/edit')
    expect(screen.getAllByText('Excluir')).toHaveLength(1)
  })
})
