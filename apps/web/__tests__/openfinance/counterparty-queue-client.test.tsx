/**
 * RTL do CounterpartyQueueClient, focado na exceção por lançamento: o grupo
 * tem uma natureza/categoria padrão, mas um lançamento específico pode sair
 * dali com outra — sem virar regra da contraparte (ver
 * lib/openfinance/counterparty-actions.ts).
 *
 * `@/components/ui/select` é mockado (Radix + jsdom não combinam bem em
 * teste, mesmo racional de `__tests__/finance/dashboard.test.tsx` pros
 * componentes de recharts) por um `<select>` nativo com a mesma interface.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/openfinance/counterparty-actions', () => ({
  confirmCounterparty: vi.fn(async () => ({ reclassified: 2 })),
}))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) =>
    React.createElement(
      'select',
      { value: value ?? '', onChange: (e: any) => onValueChange(e.target.value) },
      children
    ),
  SelectTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement('option', { value }, children),
}))

import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'
import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

const PENDING = [
  {
    counterpartyId: 'cp-1',
    displayName: 'Pix enviado Maraisa Ramos',
    keyType: 'tax_id' as const,
    count: 2,
    totalCents: 9_075_000,
    items: [
      { id: 'tx-normal', date: '2026-01-05', description: 'Pix enviado Maraisa Ramos', amountCents: 75_000 },
      { id: 'tx-outlier', date: '2026-01-29', description: 'Pix enviado Maraisa Ramos', amountCents: 9_000_000 },
    ],
  },
]

const CATEGORY_OPTIONS = [{ id: 'cat-expense', label: 'Aluguel', type: 'expense' as const }]
const ACCOUNT_OPTIONS = [{ id: 'conta-destino', name: 'Poupança' }]

beforeEach(() => {
  vi.mocked(confirmCounterparty).mockClear()
})

describe('CounterpartyQueueClient — exceção por lançamento', () => {
  it('confirma o grupo com padrão + uma exceção num lançamento específico', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByText('ver lançamentos'))

    // padrão do grupo: despesa / aluguel
    fireEvent.click(screen.getByRole('button', { name: 'Despesa' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cat-expense' } })

    // o lançamento atípico foge do padrão: vira transferência pra uma conta própria
    const outlierRow = screen.getByTestId('item-tx-outlier')
    fireEvent.click(within(outlierRow).getByText('usar classificação diferente'))
    fireEvent.click(within(outlierRow).getByRole('button', { name: 'Transferência' }))
    fireEvent.change(within(outlierRow).getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledTimes(1)
    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'expense',
      categoryId: 'cat-expense',
      transferAccountId: null,
      exceptions: [{ transactionId: 'tx-outlier', nature: 'transfer', categoryId: null, transferAccountId: 'conta-destino' }],
    })
  })
})

describe('CounterpartyQueueClient — transferência com conta de destino', () => {
  it('confirma o grupo como transferência com a conta escolhida', async () => {
    render(
      React.createElement(CounterpartyQueueClient, {
        mode: 'page',
        pending: PENDING,
        confirmed: [],
        categoryOptions: CATEGORY_OPTIONS,
        accountOptions: ACCOUNT_OPTIONS,
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'conta-destino' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    })

    expect(confirmCounterparty).toHaveBeenCalledWith({
      counterpartyId: 'cp-1',
      nature: 'transfer',
      categoryId: null,
      transferAccountId: 'conta-destino',
      exceptions: [],
    })
  })
})
