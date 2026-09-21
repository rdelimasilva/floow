import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { textoDeRemocao } from '@/lib/finance/delete-copy'

/**
 * A previsão recorrente não conciliada pode ser excluída — e dá para ver que pode.
 *
 * O botão já existia. O que não existia era o rótulo: numa fila de quatro
 * ícones, a lixeira era o único sem `title` e sem nome acessível, ao lado de um
 * ✕ que anunciava "Cancelar recorrência". Quem olhava a linha lia "só posso
 * cancelar a recorrência inteira" e a opção de apagar aquele lançamento era,
 * na prática, inexistente.
 *
 * Os dois gestos precisam ser distinguíveis, porque fazem coisas diferentes:
 * o ✕ mata o template e apaga as parcelas FUTURAS (as vencidas ficam — ver
 * `cancelRecurring`), a lixeira apaga esta linha e deixa o template de pé.
 *
 * E o texto da confirmação tinha que parar de prometer reversão de saldo para
 * uma linha que nunca entrou em saldo nenhum.
 */

vi.mock('@/lib/finance/actions', () => ({}))

const { TransactionDesktopRow, TransactionMobileCard } = await import(
  '@/components/finance/transaction-display-row'
)

const onDelete = vi.fn()
const onCancelRecurring = vi.fn()

const ACOES = {
  onToggleSelect: vi.fn(),
  onEdit: vi.fn(),
  onDelete,
  onIgnore: vi.fn(),
  onToggleCashFlow: vi.fn(),
  onCancelRecurring,
  onCreateRule: vi.fn(),
} as never

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T12:00:00-03:00'))
})
afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  onDelete.mockClear()
  onCancelRecurring.mockClear()
})

/** Previsão de template cuja data passou e que o banco nunca confirmou. */
const NAO_CONCILIADA = {
  id: 'tx-1',
  type: 'expense' as const,
  amountCents: -120000,
  description: 'Aluguel',
  date: '2026-09-01',
  accountId: 'conta-1',
  categoryId: 'cat-1',
  categoryName: 'Moradia',
  categoryColor: null,
  categoryIcon: null,
  recurringTemplateId: 'tpl-1',
  balanceApplied: false,
  matchedTransactionId: null,
  externalId: null,
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
          tx: { ...NAO_CONCILIADA, ...extra } as never,
          balance: 0,
          isSelected: false,
          loading: false,
          actions: ACOES,
        }),
      ),
    ),
  )
}

describe('linha de previsão recorrente não conciliada', () => {
  it('oferece excluir a previsão, com rótulo', () => {
    renderDesktop()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir previsão' }))

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1' }))
  })

  it('cancelar recorrência é outro botão, e não se confunde com excluir', () => {
    renderDesktop()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar recorrência' }))

    expect(onCancelRecurring).toHaveBeenCalledWith('tpl-1', 'Aluguel')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('nenhum botão da linha fica sem nome acessível', () => {
    renderDesktop()

    const semNome = screen
      .getAllByRole('button')
      .filter((b) => !(b.getAttribute('aria-label') ?? b.textContent ?? '').trim())

    expect(semNome).toEqual([])
  })

  it('no lançamento realizado, a lixeira fala de lançamento', () => {
    renderDesktop({ balanceApplied: true, recurringTemplateId: null })

    expect(screen.getByRole('button', { name: 'Excluir lançamento' })).toBeTruthy()
  })

  it('no cartão do celular também, e com rótulo', () => {
    render(
      React.createElement(TransactionMobileCard, {
        tx: NAO_CONCILIADA as never,
        balance: 0,
        isSelected: false,
        loading: false,
        actions: ACOES,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Excluir previsão' }))

    expect(onDelete).toHaveBeenCalled()
  })
})

describe('texto da confirmação', () => {
  it('previsão não conciliada: nada de prometer reversão de saldo', () => {
    const { title, description } = textoDeRemocao(NAO_CONCILIADA)

    expect(title).toBe('Excluir previsão')
    expect(description).not.toContain('saldo será revertido')
    expect(description).toContain('não entrou em saldo nenhum')
    expect(description).toContain('recorrência continua')
  })

  it('lançamento realizado: avisa da reversão', () => {
    const { description } = textoDeRemocao({ ...NAO_CONCILIADA, balanceApplied: true })

    expect(description).toContain('saldo da conta será revertido')
  })

  it('transferência: as duas pernas', () => {
    const { description } = textoDeRemocao({
      ...NAO_CONCILIADA,
      balanceApplied: true,
      transferGroupId: 'grp-1',
    })

    expect(description).toContain('pernas')
  })

  it('sem alvo, não explode', () => {
    expect(textoDeRemocao(null).title).toBeTruthy()
  })
})
