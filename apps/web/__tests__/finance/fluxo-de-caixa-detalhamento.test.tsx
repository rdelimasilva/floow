/**
 * Tabela de detalhamento do Fluxo de Caixa (revisão de 18/10/2026).
 *
 * - O rótulo do mês saía "Outubro De 2026": a célula usava a classe CSS
 *   `capitalize`, que põe maiúscula em TODAS as palavras. Só a primeira letra
 *   deve subir.
 * - A tabela tinha altura máxima com scroll próprio dentro da página que já
 *   rola — scroll aninhado.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CashFlowBreakdown } from '@/components/finance/cash-flow-breakdown'

const transactions = [
  { date: '2026-10-05', amountCents: 500_00, type: 'income', accountId: 'a1' },
  { date: '2026-09-05', amountCents: -100_00, type: 'expense', accountId: 'a1' },
]

describe('detalhamento do fluxo de caixa', () => {
  it('rótulo do mês: só a primeira letra maiúscula ("Outubro de 2026")', () => {
    render(<CashFlowBreakdown transactions={transactions} />)
    const celula = screen.getByText('Outubro de 2026')
    expect(celula.className).not.toContain('capitalize')
  })

  it('a tabela não tem scroll vertical próprio', () => {
    const { container } = render(<CashFlowBreakdown transactions={transactions} />)
    const table = container.querySelector('table')!
    let el: HTMLElement | null = table.parentElement
    while (el && el !== container) {
      expect(el.className).not.toMatch(/overflow-y-auto|max-h-/)
      el = el.parentElement
    }
  })
})
