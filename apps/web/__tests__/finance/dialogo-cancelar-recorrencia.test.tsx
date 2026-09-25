import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'

/**
 * A opção de limpar as vencidas vive no gesto de cancelar a recorrência.
 *
 * Sem ela, as parcelas cuja data passou e que o banco nunca confirmou ficavam
 * para trás uma a uma — e, com o template já desativado, nem cancelar de novo
 * as alcançava. Com ela, é a mesma decisão: cancelo o template e digo se levo
 * o que sobrou.
 *
 * Desligada por padrão porque apagar lançamento é irreversível.
 */

// O jsdom não traz `matchMedia` nem o modal de `<dialog>`. Sem estes dois, o
// teste morre no `useEffect` da lista e o diálogo nunca abre.
window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as never
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const cancelRecurring = vi.fn(async (_formData: FormData) => ({
  futurasRemovidas: 3,
  vencidasRemovidas: 2,
}))

vi.mock('@/lib/finance/recurring-cancel', () => ({ cancelRecurring }))
vi.mock('@/lib/finance/transaction-actions', () => ({
  deleteTransaction: vi.fn(),
  toggleIgnoreTransaction: vi.fn(),
  bulkDeleteTransactions: vi.fn(),
  bulkCategorizeTransactions: vi.fn(),
}))
vi.mock('@/lib/finance/cash-flow-actions', () => ({ setTransactionAffectsCashFlow: vi.fn() }))

const { TransactionList } = await import('@/components/finance/transaction-list')
const { ToastProvider } = await import('@/components/ui/toast')

const TX = {
  id: 'tx-1',
  type: 'expense' as const,
  amountCents: -120000,
  description: 'Aluguel',
  date: '2026-09-01',
  accountId: 'conta-1',
  categoryId: null,
  categoryName: null,
  categoryColor: null,
  categoryIcon: null,
  recurringTemplateId: 'tpl-1',
  balanceApplied: false,
  matchedTransactionId: null,
  externalId: null,
  runningBalance: 0,
}

function abrirDialogo() {
  render(
    React.createElement(ToastProvider, null,
      React.createElement(TransactionList, {
        transactions: [TX] as never,
        accounts: [{ id: 'conta-1', name: 'Itaú' }],
        categories: [],
      })),
  )
  fireEvent.click(screen.getAllByRole('button', { name: 'Mais ações' })[0])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar recorrência' }))
}

/** Dentro do diálogo: fora dele existe o ✕ da linha, com o mesmo nome. */
const dialogo = () => within(screen.getByRole('dialog'))
const opcao = () => dialogo().getByRole('checkbox', { name: /vencidas e não conciliadas/ })
const confirmar = async () => {
  await act(async () => {
    fireEvent.click(dialogo().getByRole('button', { name: 'Cancelar recorrência' }))
  })
}

beforeEach(() => {
  cancelRecurring.mockClear()
})

describe('diálogo de cancelar recorrência', () => {
  it('oferece limpar as vencidas, desmarcado', () => {
    abrirDialogo()

    expect((opcao() as HTMLInputElement).checked).toBe(false)
  })

  it('sem marcar, não pede a limpeza', async () => {
    abrirDialogo()
    await confirmar()

    const enviado = cancelRecurring.mock.calls[0][0]
    expect(enviado.get('templateId')).toBe('tpl-1')
    expect(enviado.get('removeOverdue')).toBeNull()
  })

  it('marcando, pede a limpeza junto', async () => {
    abrirDialogo()
    fireEvent.click(opcao())
    await confirmar()

    const enviado = cancelRecurring.mock.calls[0][0]
    expect(enviado.get('removeOverdue')).toBe('1')
  })

  it('conta ao usuário quantas linhas saíram', async () => {
    abrirDialogo()
    fireEvent.click(opcao())
    await confirmar()

    expect(screen.getByText(/3 parcela\(s\) futura\(s\) e 2 vencida\(s\)/)).toBeTruthy()
  })
})
