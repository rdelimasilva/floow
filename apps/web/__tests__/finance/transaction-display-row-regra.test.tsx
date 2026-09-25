import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const { TransactionDesktopRow, TransactionMobileCard } = await import(
  '@/components/finance/transaction-display-row'
)

const ACOES = {
  onToggleSelect: vi.fn(), onUnreconcile: vi.fn(),
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

describe('botão desconciliar no lançamento', () => {
  it('classificado pela regra mostra (desktop e mobile)', () => {
    renderDesktop({ counterpartyId: 'cp-1', reviewState: 'confirmed' })
    expect(screen.getByRole('button', { name: 'Desconciliar' })).toBeTruthy()
  })

  it('ainda na fila não mostra', () => {
    renderMobile({ counterpartyId: 'cp-1', reviewState: 'pending' })
    expect(screen.queryByRole('button', { name: 'Desconciliar' })).toBeNull()
  })

  it('previsão cumprida mostra e chama a ação com o lançamento', () => {
    const onUnreconcile = vi.fn()
    render(
      React.createElement(TransactionMobileCard, {
        tx: { ...BASE, matchedTransactionId: 'r-1' } as never,
        balance: 0, isSelected: false, loading: false,
        actions: { ...(ACOES as object), onUnreconcile } as never,
      }),
    )
    screen.getByRole('button', { name: 'Desconciliar' }).click()
    expect(onUnreconcile).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }))
  })

  it('lançamento manual não mostra', () => {
    renderDesktop({ reviewState: 'confirmed' })
    expect(screen.queryByRole('button', { name: 'Desconciliar' })).toBeNull()
  })
})

/**
 * O raio "categorizar todas como esta" só aparecia em transação já
 * categorizada — justo a sem categoria, que é quem precisa de regra, ficava
 * sem ele. E o card do celular não tinha o botão.
 */
describe('atalho de regra (raio)', () => {
  it('sem categoria também oferece, e a categoria é escolhida no diálogo', () => {
    renderDesktop({ categoryId: null })
    screen.getByRole('button', { name: 'Criar regra para lançamentos como este' }).click()
    expect((ACOES as unknown as { onCreateRule: ReturnType<typeof vi.fn> }).onCreateRule).toHaveBeenCalledWith('Compra do carro', '')
  })

  it('transferência não oferece', () => {
    renderDesktop({ type: 'transfer', categoryId: null })
    expect(screen.queryByRole('button', { name: /Criar regra|Categorizar todas/ })).toBeNull()
  })

  it('o card do celular também oferece', () => {
    renderMobile({ categoryId: 'cat-1' })
    expect(screen.getByRole('button', { name: 'Categorizar todas como esta' })).toBeTruthy()
  })
})
