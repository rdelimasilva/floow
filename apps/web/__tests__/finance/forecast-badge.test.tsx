import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
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

/**
 * Data fixa para os selos nao dependerem do relogio: o estado "previsto" vs.
 * "nao confirmado" e decidido comparando a data da linha com hoje, e um teste
 * que envelhece muda de resultado sozinho.
 */
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-19T12:00:00-03:00'))
})
afterAll(() => {
  vi.useRealTimers()
})

describe('selo de previsto', () => {
  it('lançamento previsto e sem vínculo mostra "previsto"', () => {
    renderRow({ balanceApplied: false })

    screen.getByText('previsto')
  })

  it('previsto já casado com o realizado mostra "confirmado", não "previsto"', () => {
    renderRow({ balanceApplied: false, matchedTransactionId: 'real-1' })

    screen.getByText('confirmado')
    expect(screen.queryByText('previsto')).toBeNull()
  })

  it('parcela futura do banco é "previsto", mas não diz que ainda não aconteceu', () => {
    renderRow({ balanceApplied: false, externalId: 'polp-4', date: '2026-10-16' })

    expect(screen.getByText('previsto').getAttribute('title')).toBe(
      'Parcela do cartão com vencimento futuro. Entra no saldo na data da fatura.',
    )
  })

  it('lançamento realizado não mostra selo nenhum dos dois', () => {
    renderRow({ balanceApplied: true })

    expect(screen.queryByText('previsto')).toBeNull()
    expect(screen.queryByText('confirmado')).toBeNull()
  })
})

/**
 * O terceiro estado, que faltava e e a razao desta mudanca.
 *
 * A previsao cuja data chegou e que o extrato nao confirmou nao tem mais como
 * se esconder: ela nao soma em saldo nenhum e precisa aparecer, porque
 * depende de uma decisao do usuario. Antes ela era somada no saldo e nao
 * tinha selo — indistinguivel de um lancamento de verdade.
 */
describe('selo de nao confirmado', () => {
  it('previsao vencida sem par do banco mostra "nao confirmado"', () => {
    renderRow({ balanceApplied: false, date: '2026-08-15' })

    screen.getByText('não confirmado')
    expect(screen.queryByText('previsto')).toBeNull()
  })

  it('previsao vencida ja casada mostra "confirmado", nao "nao confirmado"', () => {
    renderRow({ balanceApplied: false, date: '2026-08-15', matchedTransactionId: 'real-1' })

    screen.getByText('confirmado')
    expect(screen.queryByText('não confirmado')).toBeNull()
  })

  it('previsao que vence hoje ja conta como nao confirmada', () => {
    renderRow({ balanceApplied: false, date: '2026-09-19' })

    screen.getByText('não confirmado')
  })
})

/**
 * A linha de previsao e desenhada com `opacity-60`, para o previsto futuro
 * pesar menos que o lancamento de verdade. Aplicar a mesma opacidade na
 * previsao NAO CONCILIADA apagaria justamente a linha que exige acao — selo
 * vermelho em texto desbotado.
 */
describe('opacidade da linha', () => {
  function classesDaLinha(extra: Record<string, unknown>) {
    const { container } = render(
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
    return container.querySelector('tr')!.className
  }

  it('previsao futura fica apagada', () => {
    expect(classesDaLinha({ balanceApplied: false, date: '2026-10-15' })).toContain('opacity-60')
  })

  it('previsao nao conciliada NAO fica apagada', () => {
    expect(classesDaLinha({ balanceApplied: false, date: '2026-08-15' })).not.toContain('opacity-60')
  })
})
