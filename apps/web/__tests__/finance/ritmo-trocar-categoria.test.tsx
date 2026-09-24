import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * No Ritmo de Gastos, a lista de transações da categoria deixa abrir o
 * lançamento e trocar a categoria ali mesmo.
 */
const LINHA = {
  id: 't1', date: '2026-09-10', description: 'IFOOD *REST', spentCents: 4_500,
  categoryId: 'alim', categoryName: 'Alimentação', accountId: 'acc-1', accountName: 'Nubank',
}
const getPacingCategoryTransactions = vi.fn(async () => [LINHA])
const bulkCategorizeTransactions = vi.fn(async () => {})
const refresh = vi.fn()
vi.mock('@/lib/finance/budget-pacing-actions', () => ({ getPacingCategoryTransactions }))
vi.mock('@/lib/finance/transaction-actions', () => ({ bulkCategorizeTransactions }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { PacingTransactionsDialog, linkDoLancamento } = await import('@/components/finance/pacing-transactions-dialog')
const { ToastProvider } = await import('@/components/ui/toast')

const OPCOES = [
  { id: 'alim', label: 'Alimentação' },
  { id: 'rest', label: '   Restaurantes' },
  { id: 'lazer', label: 'Lazer' },
]

async function abrir(memberIds = ['alim', 'rest']) {
  await act(async () => {
    render(
      <ToastProvider>
        <PacingTransactionsDialog
          category={{ id: 'alim', name: 'Alimentação', memberIds }}
          month="2026-09-01"
          categoryOptions={OPCOES}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    )
  })
}

beforeEach(() => { vi.clearAllMocks() })

describe('Ritmo de Gastos: lançamento no popup', () => {
  it('"Abrir" leva às Transações filtradas no lançamento', async () => {
    await abrir()
    const link = screen.getByRole('link', { name: 'Abrir' })
    expect(link.getAttribute('href')).toBe(linkDoLancamento(LINHA))
    expect(linkDoLancamento(LINHA)).toContain('startDate=2026-09-10')
    expect(linkDoLancamento(LINHA)).toContain('accountId=acc-1')
  })

  it('trocar para categoria fora do teto tira o lançamento da lista e atualiza a tela', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar categoria' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nova categoria de IFOOD *REST'), { target: { value: 'lazer' } })
    })
    expect(bulkCategorizeTransactions).toHaveBeenCalledWith(['t1'], 'lazer')
    expect(screen.queryByText('IFOOD *REST')).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('trocar para filha do mesmo teto mantém o lançamento, com a categoria nova', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar categoria' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nova categoria de IFOOD *REST'), { target: { value: 'rest' } })
    })
    expect(screen.getByText('IFOOD *REST')).toBeTruthy()
    expect(screen.getByText(/Nubank · Restaurantes/)).toBeTruthy()
  })
})
