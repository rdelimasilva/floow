import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { BudgetGoalSuggestionsCard } from '@/components/finance/budget-goal-suggestions-card'

const SUG = {
  categoryId: 'casa', categoryName: 'Casa', medianCents: 612_300, suggestedCents: 620_000,
  monthsWithSpend: 11, monthsConsidered: 12,
}

describe('BudgetGoalSuggestionsCard', () => {
  it('mostra gasto típico e cria meta com o valor sugerido', () => {
    const onCreate = vi.fn()
    render(<BudgetGoalSuggestionsCard suggestions={[SUG]} onCreate={onCreate} />)
    expect(screen.getByText('Casa')).toBeTruthy()
    expect(screen.getByText(/gastou em 11 de 12 meses/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Criar meta de/ }))
    expect(onCreate).toHaveBeenCalledWith('casa', 620_000)
  })

  it('sem sugestões não renderiza nada', () => {
    const { container } = render(<BudgetGoalSuggestionsCard suggestions={[]} onCreate={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })
})
