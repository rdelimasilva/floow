import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

/**
 * Cada linha tinha até 7 ícones de ação lado a lado. Editar e a pílula de
 * fluxo de caixa (que mostra estado) continuam à vista; o resto vai para o
 * menu "Mais ações".
 */
const acoes = {
  onToggleSelect: vi.fn(), onUnreconcile: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onIgnore: vi.fn(), onToggleCashFlow: vi.fn(), onCancelRecurring: vi.fn(), onCreateRule: vi.fn(),
}

const TX = {
  id: 'tx-1', type: 'expense' as const, amountCents: -5000, description: 'Mercado', date: '2026-09-10',
  accountId: 'a', categoryId: 'cat-1', categoryName: 'Mercado', categoryColor: null, categoryIcon: null,
  recurringTemplateId: 'rec-1',
}

function montar(extra: Record<string, unknown> = {}) {
  render(
    <table><tbody>
      <TransactionDesktopRow tx={{ ...TX, ...extra } as never} balance={0} isSelected={false} loading={false} actions={acoes as never} />
    </tbody></table>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('menu de ações da linha', () => {
  it('à vista ficam só Editar e o menu', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Editar lançamento' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Excluir lançamento' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mais ações' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('o menu lista as ações e executa a escolhida', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))

    const itens = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(itens).toEqual(['Categorizar todas como esta', 'Cancelar recorrência', 'Excluir lançamento'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir lançamento' }))
    expect(acoes.onDelete).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Esc fecha o menu', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
