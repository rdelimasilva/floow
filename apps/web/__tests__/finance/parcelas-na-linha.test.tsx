import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParcelasNaLinha } from '@/app/(app)/budgets/spending/parcelas-na-linha'

describe('ParcelasNaLinha', () => {
  it('sem parcelas, não renderiza nada', () => {
    const { container } = render(<ParcelasNaLinha parcelas={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('mostra o total a vencer e lista as parcelas no title', () => {
    render(<ParcelasNaLinha parcelas={{ totalCents: 28023, parcelas: [{ categoryId: 'casa', description: 'Westwing', installmentNumber: 2, installmentTotal: 6, amountCents: 28023 }] }} />)
    const nota = screen.getByText(/parcelas a vencer/)
    expect(nota.textContent).toContain('280,23')
    expect(nota.getAttribute('title')).toContain('Westwing 2/6')
  })
})
