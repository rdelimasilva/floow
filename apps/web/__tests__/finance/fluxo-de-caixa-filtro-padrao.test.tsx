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
    // O localStorage do Node sobrepõe o do jsdom e não grava; a tela precisa de um que funcione.
    const guardado = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => { guardado.set(k, v) },
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  const props = {
    transactions: [{ date: '2026-10-05', amountCents: 500_00, type: 'income', accountId: 'a1' }],
    futureTransactions: [{ date: '2026-11-05', amountCents: -80_00, type: 'expense', accountId: 'a1' }],
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
    expect(screen.getByRole('button', { name: 'Projetado' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Despesas (projetado)', { selector: 'p' }).nextElementSibling!.textContent).toContain('80,00')
  })
})

describe('filtro de conta do fluxo de caixa', () => {
  it('conta marcada vale para os cards', () => {
    render(
      <CashFlowClient
        transactions={[
          { date: '2026-10-05', amountCents: 500_00, type: 'income', accountId: 'a1' },
          { date: '2026-10-06', amountCents: 300_00, type: 'income', accountId: 'a2' },
        ]}
        futureTransactions={[]}
        accounts={[{ id: 'a1', name: 'Itaú' }, { id: 'a2', name: 'Nubank' }]}
      />,
    )
    const receitas = () => screen.getByText(/^Receitas/, { selector: 'p' }).nextElementSibling!.textContent
    expect(receitas()).toContain('800,00')
    fireEvent.click(screen.getByRole('button', { name: /Todas as contas/ }))
    fireEvent.click(screen.getByText('Nubank'))
    expect(receitas()).toContain('300,00')
  })
})
