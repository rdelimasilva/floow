import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * O lançamento de Meta de Gastos e de Investimentos abre no mesmo molde do diálogo de Recorrentes:
 * modal, com bloco de Duração e um resumo do que vai ser criado.
 */

// O jsdom não traz o modal de `<dialog>`.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const createBudgetEntry = vi.fn(async (_fd: FormData) => ({}))
vi.mock('@/lib/finance/budget-actions', () => ({ createBudgetEntry }))
vi.mock('@/lib/finance/category-actions', () => ({ createCategory: vi.fn() }))

const { BudgetEntryDialog } = await import(
  '@/components/finance/budget-entry-dialog'
)
const { ToastProvider } = await import('@/components/ui/toast')

const CATEGORIAS = [
  { id: 'cat-1', name: 'Mercado', type: 'expense', color: null, icon: null },
]

function renderDialog(onClose = vi.fn()) {
  render(
    <ToastProvider>
      <BudgetEntryDialog
        type="spending"
        open
        onClose={onClose}
        availableCategories={CATEGORIAS}
        onCategoryCreated={vi.fn()}
        defaultStartMonth="2026-09-01"
      />
    </ToastProvider>,
  )
  return onClose
}

describe('diálogo de novo lançamento em Meta de Gastos', () => {
  beforeEach(() => createBudgetEntry.mockClear())

  it('abre como modal e resume o teto sem fim', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Ex: 800,00'), { target: { value: '1.200,00' } })
    expect(screen.getByText(/Teto de R\$\s1\.200,00 por mês a partir de/)).toBeTruthy()
  })

  it('envia o mês final quando a duração é "Até um mês"', async () => {
    const onClose = renderDialog()
    fireEvent.change(screen.getByRole('combobox', { hidden: true }), { target: { value: 'cat-1' } })
    fireEvent.change(screen.getByPlaceholderText('Ex: 800,00'), { target: { value: '800,00' } })
    fireEvent.click(screen.getByLabelText('Até um mês'))
    const [, fim] = document.querySelectorAll('input[type="month"]')
    fireEvent.change(fim, { target: { value: '2026-12' } })
    expect(screen.getByText(/durante 4 meses/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar', hidden: true }))
    })

    const fd = createBudgetEntry.mock.calls[0][0]
    expect(fd.get('categoryId')).toBe('cat-1')
    expect(fd.get('plannedCents')).toBe('80000')
    expect(fd.get('startMonth')).toBe('2026-09-01')
    expect(fd.get('endMonth')).toBe('2026-12-01')
    expect(onClose).toHaveBeenCalled()
  })

  it('em investimentos pede descrição em vez de categoria', async () => {
    render(
      <ToastProvider>
        <BudgetEntryDialog type="investing" open onClose={vi.fn()} defaultStartMonth="2026-09-01" />
      </ToastProvider>,
    )
    expect(screen.queryByRole('combobox', { hidden: true })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Ex: 2.000,00'), { target: { value: '2.000,00' } })
    expect(screen.getByText(/Meta de R\$\s2\.000,00 por mês/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar', hidden: true }))
    })

    const fd = createBudgetEntry.mock.calls[0][0]
    expect(fd.get('type')).toBe('investing')
    expect(fd.get('name')).toBe('Aporte mensal')
    expect(fd.get('plannedCents')).toBe('200000')
    expect(fd.get('categoryId')).toBeNull()
  })
})
