import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

/**
 * "Clonar" numa recorrência existente abre o popup de NOVA recorrência já
 * preenchido com os dados dela — tipo, descrição, conta, categoria, valor,
 * frequência e notas. Salvar cria outra recorrência; a original não é tocada.
 * A data de início parte de hoje: a cópia é uma série nova, não a continuação
 * da antiga.
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

const aluguel = {
  id: 'tpl-1',
  orgId: 'org-1',
  accountId: 'acc-2',
  categoryId: 'cat-moradia',
  type: 'expense' as const,
  amountCents: 250000,
  description: 'Aluguel',
  frequency: 'monthly',
  nextDueDate: '2026-01-10T00:00:00.000Z',
  isActive: true,
  notes: 'Apto 12',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  proximaParcela: '2026-10-10',
  ultimaParcela: '2026-12-10',
}

function renderLista() {
  return render(
    <RecurringTemplateList
      templates={[aluguel]}
      upcoming={[]}
      accounts={[
        { id: 'acc-1', name: 'Nubank' },
        { id: 'acc-2', name: 'Itaú' },
      ]}
      categories={[{ id: 'cat-moradia', name: 'Moradia', type: 'expense' }]}
    />,
  )
}

function dialogAberto() {
  const aberto = document.querySelector('dialog[open]') as HTMLElement | null
  expect(aberto).not.toBeNull()
  return within(aberto!)
}

describe('clonar recorrência', () => {
  it('abre o popup de nova recorrência preenchido com os dados da original', () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Clonar'))

    const d = dialogAberto()
    expect(d.getByRole('heading').textContent).toBe('Nova Recorrência')
    expect(d.getByDisplayValue('Aluguel')).toBeTruthy()
    expect(d.getByDisplayValue('2500,00')).toBeTruthy()
    expect(d.getByDisplayValue('Apto 12')).toBeTruthy()
    expect(d.getByDisplayValue('Itaú')).toBeTruthy()
    expect(d.getByDisplayValue('Moradia')).toBeTruthy()
    expect(d.getByDisplayValue('Mensal')).toBeTruthy()
    // Duração só existe na criação — prova que é o popup de nova, não o de editar
    expect(d.getByText('Duração')).toBeTruthy()
  })

  it('salvar cria uma recorrência nova e não altera a original', async () => {
    renderLista()
    fireEvent.click(screen.getByTitle('Clonar'))

    const d = dialogAberto()
    fireEvent.change(d.getByDisplayValue('Aluguel'), { target: { value: 'Aluguel garagem' } })
    fireEvent.click(d.getByRole('button', { name: 'Criar' }))

    await waitFor(() => expect(createRecurringTemplate).toHaveBeenCalledTimes(1))
    expect(updateRecurringTemplate).not.toHaveBeenCalled()

    const fd = createRecurringTemplate.mock.calls[0][0]
    expect(fd.get('id')).toBeNull()
    expect(fd.get('description')).toBe('Aluguel garagem')
    expect(fd.get('accountId')).toBe('acc-2')
    expect(fd.get('categoryId')).toBe('cat-moradia')
    expect(fd.get('type')).toBe('expense')
    expect(fd.get('amountCents')).toBe('250000')
    expect(fd.get('frequency')).toBe('monthly')
    expect(fd.get('notes')).toBe('Apto 12')
    expect(fd.get('endMode')).toBe('count')
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    expect(fd.get('nextDueDate')).toBe(hoje)
  })
})
