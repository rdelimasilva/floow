import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * Hoje o previsto tem só `opacity-60` na linha, e o ignorado tem
 * `opacity-40`. Os dois são apenas linhas apagadas: quem não conhece a
 * convenção não distingue "vai acontecer" de "está errado".
 *
 * Com o casamento previsto/realizado, o estado passou a ter três valores, e
 * opacidade não expressa três coisas. Daí os selos.
 */

vi.mock('@/lib/finance/actions', () => ({}))

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

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
  type: 'income' as const,
  amountCents: 3_250_000,
  description: 'Salário - Soma Cooperativa (10/61)',
  date: '2026-10-15',
  accountId: 'conta-1',
  categoryName: null,
  categoryColor: null,
  categoryIcon: null,
}

function renderRow(extra: Record<string, unknown> = {}) {
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

describe('selo de previsto', () => {
  it('lançamento previsto e sem vínculo mostra "previsto"', () => {
    renderRow({ balanceApplied: false })

    screen.getByText('previsto')
  })

  it('previsto já casado com o realizado mostra "conciliado", não "previsto"', () => {
    renderRow({ balanceApplied: false, matchedTransactionId: 'real-1' })

    screen.getByText('conciliado')
    expect(screen.queryByText('previsto')).toBeNull()
  })

  it('lançamento realizado não mostra selo nenhum dos dois', () => {
    renderRow({ balanceApplied: true })

    expect(screen.queryByText('previsto')).toBeNull()
    expect(screen.queryByText('conciliado')).toBeNull()
  })
})
