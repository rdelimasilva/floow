import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O vínculo no sentido inverso: quem olha a lista de lançamentos precisa ver
 * que aquela saída virou um bem.
 *
 * Sem isso, o vínculo de `fixed_assets.acquisition_transaction_id` só era
 * visível a partir do ativo — quem chegasse pelo extrato via uma despesa
 * grande sem explicação.
 */

vi.mock('@/lib/finance/actions', () => ({}))

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

const ACOES = {
  onToggleSelect: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onIgnore: vi.fn(),
  onDuplicate: vi.fn(),
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

describe('selo de bem adquirido na linha do lançamento', () => {
  it('mostra o nome do bem quando o lançamento adquiriu um', () => {
    renderRow({ acquiredAssetId: 'asset-1', acquiredAssetName: 'Fusca 1972' })

    screen.getByText(/Fusca 1972/)
  })

  it('não mostra selo quando o lançamento não adquiriu nada', () => {
    renderRow()

    expect(screen.queryByText(/virou bem/i)).toBeNull()
  })
})
