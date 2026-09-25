/**
 * O `onSubmit` do formulário de transação não tinha try/catch. Quando o
 * servidor recusava o lançamento, a promessa rejeitava dentro do
 * `handleSubmit` e o usuário via o botão voltar de "Registrando..." para
 * "Registrar Transação" sem mensagem nenhuma — parecia que tinha salvo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/finance/transaction-create-actions', () => ({
  createTransaction: vi.fn(),
  createRecurringTransactions: vi.fn(),
}))

vi.mock('@/lib/finance/category-actions', () => ({
  createCategory: vi.fn(),
}))

const toastSpy = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}))

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushSpy }),
}))

// O Select do Radix não abre no jsdom; um <select> nativo cumpre o mesmo contrato.
vi.mock('@/components/finance/account-select', () => ({
  AccountSelect: ({ id, accounts, value, onChange }: {
    id: string
    accounts: { id: string; name: string }[]
    value?: string
    onChange: (v: string) => void
  }) => (
    <select id={id} data-testid={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  ),
}))

import { TransactionForm } from '@/components/finance/transaction-form'
import { createTransaction } from '@/lib/finance/transaction-create-actions'

const CONTA = { id: '11111111-1111-4111-8111-111111111111', name: 'Itaú' }

function preencherEEnviar() {
  fireEvent.change(screen.getByTestId('accountId'), { target: { value: CONTA.id } })
  fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '150,75' } })
  fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Mercado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar Transação' }))
}

describe('TransactionForm — erro no envio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('avisa o usuário quando o servidor recusa o lançamento', async () => {
    vi.mocked(createTransaction).mockRejectedValue(new Error('Conta inativa.'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<TransactionForm accounts={[CONTA] as any} categories={[]} />)

    preencherEEnviar()

    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Conta inativa.', 'error'))
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
