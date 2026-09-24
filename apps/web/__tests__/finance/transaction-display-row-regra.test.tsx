import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const { TransactionDesktopRow, TransactionMobileCard } = await import(
  '@/components/finance/transaction-display-row'
)

const ACOES = {
  onToggleSelect: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onIgnore: vi.fn(),
  onToggleCashFlow: vi.fn(),
  onCancelRecurring: vi.fn(),
  onCreateRule: vi.fn(),
} as never

const BASE = {
  id: 'tx-1',
  type: 'expense' as const,
  amountCents: -5_000_000,
  description: 'Compra do carro',
  date: '2026-01-10',
  accountId: 'conta-1',
  categoryName: null,
  categoryColor: null,
  categoryIcon: null,
}

function renderDesktop(extra: Record<string, unknown> = {}) {
  render(
    React.createElement(
      'table',
      null,
      React.createElement(
        'tbody',
        null,
        React.createElement(TransactionDesktopRow, {
          tx: { ...BASE, ...extra } as never,
          balance: 0,
          isSelected: false,
          loading: false,
          actions: ACOES,
        }),
      ),
    ),
  )
}

function renderMobile(extra: Record<string, unknown> = {}) {
  render(
    React.createElement(TransactionMobileCard, {
      tx: { ...BASE, ...extra } as never,
      balance: 0,
      isSelected: false,
      loading: false,
      actions: ACOES,
    }),
  )
}

describe('link para corrigir regra no lançamento', () => {
  it('lançamento de regra mostra o link para corrigir (desktop)', () => {
    renderDesktop({ counterpartyId: 'cp-1' })
    expect(screen.getAllByRole('link', { name: 'Corrigir regra' })[0].getAttribute('href')).toBe(
      '/transactions/review?regra=cp-1',
    )
  })

  it('lançamento manual não mostra (desktop)', () => {
    renderDesktop({ counterpartyId: null })
    expect(screen.queryByRole('link', { name: 'Corrigir regra' })).toBeNull()
  })

  it('lançamento de regra mostra o link para corrigir (mobile)', () => {
    renderMobile({ counterpartyId: 'cp-1' })
    expect(screen.getAllByRole('link', { name: 'Corrigir regra' })[0].getAttribute('href')).toBe(
      '/transactions/review?regra=cp-1',
    )
  })

  it('lançamento manual não mostra (mobile)', () => {
    renderMobile({ counterpartyId: null })
    expect(screen.queryByRole('link', { name: 'Corrigir regra' })).toBeNull()
  })
})
