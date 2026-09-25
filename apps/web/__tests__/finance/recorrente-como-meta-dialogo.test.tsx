import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * O popup de recorrência tem "Contar como meta de gasto". Só aparece para
 * despesa com categoria — sem categoria não há meta onde entrar, e receita
 * não é gasto. Na edição vem marcado conforme o template.
 */

const createRecurringTemplate = vi.fn(async (_fd: FormData) => ({}))
const updateRecurringTemplate = vi.fn(async (_fd: FormData) => ({ movidas: 0 }))

vi.mock('@/lib/finance/recurring-actions', () => ({
  createRecurringTemplate: (fd: FormData) => createRecurringTemplate(fd),
  updateRecurringTemplate: (fd: FormData) => updateRecurringTemplate(fd),
  deleteRecurringTemplate: vi.fn(),
  toggleRecurringActive: vi.fn(),
  generateRecurringTransaction: vi.fn(),
}))
vi.mock('@/lib/finance/category-actions', () => ({ createCategory: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { RecurringTemplateList } = await import('@/components/finance/recurring-template-list')

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

beforeEach(() => {
  createRecurringTemplate.mockClear()
  updateRecurringTemplate.mockClear()
})

const luz = {
  id: 'tpl-1',
  orgId: 'org-1',
  accountId: 'acc-1',
  categoryId: 'cat-moradia',
  type: 'expense' as const,
  amountCents: 30000,
  description: 'Conta de luz',
  frequency: 'monthly',
  nextDueDate: '2026-01-10T00:00:00.000Z',
  isActive: true,
  notes: null,
  countsAsBudget: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  proximaParcela: '2026-10-10',
  ultimaParcela: '2026-12-10',
}

function renderLista() {
  return render(
    <RecurringTemplateList
      templates={[luz]}
      upcoming={[]}
      accounts={[{ id: 'acc-1', name: 'Nubank' }]}
      categories={[
        { id: 'cat-moradia', name: 'Moradia', type: 'expense' },
        { id: 'cat-salario', name: 'Salário', type: 'income' },
      ]}
    />,
  )
}

function dialogAberto() {
  const aberto = document.querySelector('dialog[open]') as HTMLElement | null
  expect(aberto).not.toBeNull()
  return within(aberto!)
}

const ROTULO = 'Contar como meta de gasto'

describe('recorrente como meta de gasto — popup', () => {
  it('na edição vem marcado e salva a flag', async () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Editar'))

    const d = dialogAberto()
    const box = d.getByLabelText(ROTULO) as HTMLInputElement
    expect(box.checked).toBe(true)

    fireEvent.click(d.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(updateRecurringTemplate).toHaveBeenCalledTimes(1))
    expect(updateRecurringTemplate.mock.calls[0][0].get('countsAsBudget')).toBe('true')
  })

  it('desmarcar na edição salva falso', async () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Editar'))

    const d = dialogAberto()
    fireEvent.click(d.getByLabelText(ROTULO))
    fireEvent.click(d.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(updateRecurringTemplate).toHaveBeenCalledTimes(1))
    expect(updateRecurringTemplate.mock.calls[0][0].get('countsAsBudget')).toBe('false')
  })

  it('some sem categoria', () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Editar'))

    const d = dialogAberto()
    fireEvent.change(d.getByDisplayValue('Moradia'), { target: { value: '' } })
    expect(d.queryByLabelText(ROTULO)).toBeNull()
  })

  it('some em receita', () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Editar'))

    const d = dialogAberto()
    fireEvent.click(d.getByRole('button', { name: 'Receita' }))
    expect(d.queryByLabelText(ROTULO)).toBeNull()
  })
})
