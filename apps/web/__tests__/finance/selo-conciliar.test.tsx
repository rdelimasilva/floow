import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions } from '@/lib/finance/queries'

/**
 * O vermelho "não confirmado" significa "exige decisão sua". Com proposta
 * pendente a decisão existe e está na fila — manter o vermelho manda o usuário
 * procurar o que fazer no lugar errado.
 */

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

const ACOES = {
  onToggleSelect: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onIgnore: vi.fn(),
  onToggleCashFlow: vi.fn(), onCancelRecurring: vi.fn(), onCreateRule: vi.fn(),
} as never

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T12:00:00-03:00'))
})
afterAll(() => { vi.useRealTimers() })

const VENCIDA = {
  id: 'tx-1', type: 'expense' as const, amountCents: -120000, description: 'Aluguel',
  date: '2026-09-01', accountId: 'conta-1', categoryName: null, categoryColor: null,
  categoryIcon: null, recurringTemplateId: 'tpl-1', balanceApplied: false,
  matchedTransactionId: null, externalId: null,
}

function renderRow(extra: Record<string, unknown> = {}) {
  render(
    React.createElement('table', null,
      React.createElement('tbody', null,
        React.createElement(TransactionDesktopRow, {
          tx: { ...VENCIDA, ...extra } as never,
          balance: 0, isSelected: false, loading: false, actions: ACOES,
        }))))
}

describe('selo da previsão vencida', () => {
  it('com proposta pendente, diz "confirmar?" e não o vermelho', () => {
    renderRow({ hasPendingMatchProposal: true })

    screen.getByText('confirmar?')
    expect(screen.queryByText('não confirmado')).toBeNull()
  })

  it('sem proposta, segue o vermelho de sempre', () => {
    renderRow({ hasPendingMatchProposal: false })

    screen.getByText('não confirmado')
  })

  it('previsão já confirmada não muda', () => {
    renderRow({ matchedTransactionId: 'real-1', hasPendingMatchProposal: false })

    screen.getByText('confirmado')
  })

  it('o selo de confirmar leva a fila', () => {
    renderRow({ hasPendingMatchProposal: true })

    expect(screen.getByRole('link', { name: 'confirmar?' }).getAttribute('href'))
      .toBe('/transactions/matches')
  })
})

describe('o recorte da listagem não muda', () => {
  it('proposta pendente não entra no WHERE da lista', () => {
    const dialect = new PgDialect()
    const sql = dialect.sqlToQuery(and(...buildTransactionConditions('org-1'))!).sql.toLowerCase()

    expect(sql).not.toContain('forecast_match_proposals')
  })
})
