import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

const dismissBudgetGoalSuggestion = vi.fn(async (_id: string) => {})
vi.mock('@/lib/finance/budget-goal-suggestion-actions', () => ({ dismissBudgetGoalSuggestion }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { BudgetGoalSuggestionsCard, explicacaoDaSugestao } = await import('@/components/finance/budget-goal-suggestions-card')
const { ToastProvider } = await import('@/components/ui/toast')

const SUG = {
  categoryId: 'casa', categoryName: 'Casa', medianCents: 612_300, suggestedCents: 620_000,
  monthsWithSpend: 11, monthsConsidered: 12, firstMonth: '2025-09', lastMonth: '2026-08',
}

function renderCard(suggestions = [SUG], onCreate = vi.fn()) {
  render(
    <ToastProvider>
      <BudgetGoalSuggestionsCard suggestions={suggestions} onCreate={onCreate} />
    </ToastProvider>,
  )
  return onCreate
}

beforeEach(() => { vi.clearAllMocks() })

describe('BudgetGoalSuggestionsCard', () => {
  it('mostra gasto típico e cria meta com o valor sugerido', () => {
    const onCreate = renderCard()
    expect(screen.getByText('Casa')).toBeTruthy()
    expect(screen.getByText(/gastou em 11 de 12 meses/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Criar meta de/ }))
    expect(onCreate).toHaveBeenCalledWith('casa', 620_000)
  })

  it('descartar chama a action com a categoria', async () => {
    renderCard()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descartar' })) })
    expect(dismissBudgetGoalSuggestion).toHaveBeenCalledWith('casa')
  })

  it('o "?" abre o critério com os números da categoria', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }))
    expect(screen.getByText(/de set\/2025 a ago\/2026 \(12 meses\)/)).toBeTruthy()
  })

  it('explicação cita mediana, arredondamento e meses com gasto', () => {
    const t = explicacaoDaSugestao(SUG)
    expect(t).toMatch(/mediana/)
    expect(t).toMatch(/11 de 12/)
  })

  it('sem sugestões não renderiza nada', () => {
    renderCard([])
    expect(screen.queryByText('Sugestões de meta')).toBeNull()
  })
})
