/**
 * Regressão do auto-save no blur (`TransactionEditRow`).
 *
 * A linha de edição salva sozinha quando o usuário clica fora
 * ("auto-salva ao sair"). Convertendo um lançamento em transferência, o
 * seletor "Conta destino..." só aparece DEPOIS de escolher o tipo e nasce
 * vazio — então há uma janela em que um clique fora submetia
 * `type=transfer` sem destino.
 *
 * O servidor rejeita isso corretamente (`Transferência exige a conta de
 * destino.`, lib/finance/actions.ts), mas o cliente fechava a linha na mesma
 * hora — `onClose()` roda sem esperar o `saveEdit()` — e a edição do usuário
 * ia embora junto, com o toast de erro chegando depois da linha sumir.
 *
 * A invariante do servidor tem que existir no cliente também: conversão
 * incompleta não submete e não fecha a linha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/finance/transaction-actions', () => ({
  updateTransaction: vi.fn(async () => undefined),
}))

vi.mock('@/lib/finance/category-actions', () => ({
  createCategory: vi.fn(async () => ({ id: 'cat-nova', name: 'Nova', type: 'expense' })),
}))

const toastSpy = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { TransactionEditRow } from '@/components/finance/transaction-edit-row'
import { updateTransaction } from '@/lib/finance/transaction-actions'

const TX = {
  id: 'tx-1',
  type: 'expense' as const,
  amountCents: -25_000,
  description: 'Aluguel',
  date: '2026-09-10',
  accountId: 'conta-origem',
  categoryId: 'cat-aluguel',
  categoryName: 'Aluguel',
  categoryColor: null,
  categoryIcon: null,
}

const ACCOUNTS = [
  { id: 'conta-origem', name: 'Conta Corrente' },
  { id: 'conta-destino', name: 'Poupança' },
]

const CATEGORIES = [{ id: 'cat-aluguel', name: 'Aluguel', type: 'expense' }]

function renderRow(onClose: () => void) {
  return render(
    React.createElement(
      'table',
      null,
      React.createElement(
        'tbody',
        null,
        React.createElement(TransactionEditRow, {
          tx: TX,
          accounts: ACCOUNTS,
          categories: CATEGORIES,
          balance: 100_000,
          isSelected: false,
          onToggleSelect: vi.fn(),
          onClose,
        })
      )
    )
  )
}

/** O seletor de tipo é o único que oferece a opção "Transferência". */
function typeSelect(): HTMLSelectElement {
  const select = screen
    .getAllByRole('combobox')
    .find((s) => within(s).queryByText('Transferência'))
  if (!select) throw new Error('seletor de tipo não encontrado')
  return select as HTMLSelectElement
}

beforeEach(() => {
  // `mockReset` e não `mockClear`: implementações `...Once` enfileiradas por um
  // teste sobrevivem ao `mockClear` e vazam para o próximo.
  vi.mocked(updateTransaction).mockReset()
  vi.mocked(updateTransaction).mockResolvedValue(undefined)
  toastSpy.mockClear()
})

describe('TransactionEditRow — conversão em transferência interrompida pelo blur', () => {
  it('não submete quando o clique fora acontece antes de escolher a conta de destino', async () => {
    renderRow(vi.fn())

    fireEvent.change(typeSelect(), { target: { value: 'transfer' } })

    await act(async () => {
      fireEvent.mouseDown(document.body)
    })

    expect(updateTransaction).not.toHaveBeenCalled()
  })

  it('mantém a linha aberta para o usuário terminar a conversão', async () => {
    const onClose = vi.fn()
    renderRow(onClose)

    fireEvent.change(typeSelect(), { target: { value: 'transfer' } })

    await act(async () => {
      fireEvent.mouseDown(document.body)
    })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('avisa o usuário do que falta', async () => {
    renderRow(vi.fn())

    fireEvent.change(typeSelect(), { target: { value: 'transfer' } })

    await act(async () => {
      fireEvent.mouseDown(document.body)
    })

    expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('conta de destino'), 'error')
  })

  it('mantém a linha aberta quando o servidor rejeita o save', async () => {
    vi.mocked(updateTransaction).mockRejectedValueOnce(new Error('Conta não encontrada.'))
    const onClose = vi.fn()
    renderRow(onClose)

    // O input de descrição, não o select de categoria — ambos exibem "Aluguel".
    const descInput = screen
      .getAllByDisplayValue('Aluguel')
      .find((el) => el.tagName === 'INPUT')!
    fireEvent.change(descInput, { target: { value: 'Aluguel revisado' } })

    await act(async () => {
      fireEvent.mouseDown(document.body)
    })

    expect(updateTransaction).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submete e fecha normalmente depois que a conta de destino é escolhida', async () => {
    const onClose = vi.fn()
    renderRow(onClose)

    fireEvent.change(typeSelect(), { target: { value: 'transfer' } })

    const destSelect = screen
      .getAllByRole('combobox')
      .find((s) => within(s).queryByText('Conta destino...'))!
    fireEvent.change(destSelect, { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.mouseDown(document.body)
    })

    expect(updateTransaction).toHaveBeenCalledTimes(1)
    const formData = vi.mocked(updateTransaction).mock.calls[0][0] as FormData
    expect(formData.get('type')).toBe('transfer')
    expect(formData.get('destAccountId')).toBe('conta-destino')
    expect(onClose).toHaveBeenCalled()
  })
})
