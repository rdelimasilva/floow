import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const acceptCategorySuggestion = vi.fn(async () => ({ categoryId: 'nova', name: 'Delivery', monthlyAvgCents: 10300, moved: 38 }))
const dismissCategorySuggestion = vi.fn(async () => {})
const analyzeCategorySuggestions = vi.fn(async () => ({ pending: 0 }))
vi.mock('@/lib/finance/category-suggestion-actions', () => ({
  acceptCategorySuggestion, dismissCategorySuggestion, analyzeCategorySuggestions,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { CategorySuggestionsCard } = await import('@/components/finance/category-suggestions-card')
const { ToastProvider } = await import('@/components/ui/toast')

const SUGS = [{
  id: 's1', kind: 'uncategorized' as const, suggestedName: 'Ifood', parentCategoryId: null,
  txCount: 38, totalCents: 124000, monthlyAvgCents: 10300,
}]

function renderCard(suggestions = SUGS, onAccepted = vi.fn()) {
  render(
    <ToastProvider>
      <CategorySuggestionsCard suggestions={suggestions} parentOptions={[{ id: 'alim', name: 'Alimentação' }]} onAccepted={onAccepted} />
    </ToastProvider>,
  )
  return onAccepted
}

beforeEach(() => { vi.clearAllMocks() })

describe('CategorySuggestionsCard', () => {
  it('mostra a sugestão com números', () => {
    renderCard()
    expect(screen.getByText('Ifood')).toBeTruthy()
    expect(screen.getByText(/38 lançamentos/)).toBeTruthy()
  })
  it('recusar chama a action com o id', async () => {
    renderCard()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Recusar' })) })
    expect(dismissCategorySuggestion).toHaveBeenCalledWith('s1')
  })
  it('aceitar com nome editado chama a action e devolve o resultado', async () => {
    const onAccepted = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    fireEvent.change(screen.getByLabelText('Nome da categoria'), { target: { value: 'Delivery' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' })) })
    expect(acceptCategorySuggestion).toHaveBeenCalledWith({ suggestionId: 's1', name: 'Delivery', parentCategoryId: null })
    expect(onAccepted).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'nova', monthlyAvgCents: 10300 }))
  })
  it('sem sugestões mostra estado vazio e o botão de analisar', async () => {
    renderCard([])
    expect(screen.getByText(/Nenhuma sugestão/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analisar meus gastos' })) })
    expect(analyzeCategorySuggestions).toHaveBeenCalled()
  })
})
