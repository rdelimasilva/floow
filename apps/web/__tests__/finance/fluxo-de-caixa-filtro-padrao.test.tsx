/**
 * Fluxo de Caixa usa o filtro de período da tela de Transações: atalhos em
 * Passado, Presente e Futuro, mais as datas à mão.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('next/dynamic', () => ({
  default: () => () => React.createElement('div', { 'data-testid': 'grafico' }),
}))

import { CashFlowClient } from '@/components/finance/cash-flow-client'

describe('filtro de período do fluxo de caixa', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  const props = {
    transactions: [{ date: '2026-10-05', amountCents: 500_00, type: 'income', accountId: 'a1' }],
    futureTransactions: [{ date: '2026-11-05', amountCents: -80_00, type: 'expense', accountId: 'a1' }],
    monthlyRealized: [],
    monthlyProjected: [],
    accounts: [],
  }

  it('abre em "Últimos 12 meses", com as datas preenchidas', () => {
    render(<CashFlowClient {...props} />)
    expect(screen.getByRole('button', { name: /^Período:/ }).textContent).toContain('Últimos 12 meses')
    expect((screen.getByLabelText('Data inicial') as HTMLInputElement).value).toBe('2025-11-01')
  })

  it('atalho de futuro troca para o modo Projetado', () => {
    render(<CashFlowClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(screen.getByRole('button', { name: 'Projetado' }).className).toContain('bg-blue-600')
    expect(screen.getByText('Despesas (projetado)', { selector: 'p' }).nextElementSibling!.textContent).toContain('80,00')
  })
})
