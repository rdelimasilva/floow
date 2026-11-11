/**
 * Fluxo de Caixa usa o filtro de período da tela de Transações: atalhos em
 * Passado, Presente e Futuro, mais as datas à mão.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}))

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
    startDate: '2025-11-01',
    endDate: '2026-10-18',
    accountIds: [] as string[],
  }

  it('mostra o período que veio da URL, com as datas preenchidas', () => {
    render(<CashFlowClient {...props} />)
    expect(screen.getByRole('button', { name: /^Período:/ }).textContent).toContain('Últimos 12 meses')
    expect((screen.getByLabelText('Data inicial') as HTMLInputElement).value).toBe('2025-11-01')
  })

  it('atalho de futuro troca para o modo Projetado e grava o período na URL', () => {
    replace.mockClear()
    render(<CashFlowClient {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }))
    // A seta do mês tem o mesmo nome do atalho; o atalho é o que não tem aria-label.
    fireEvent.click(screen.getAllByRole('button', { name: 'Próximo mês' }).find((b) => !b.hasAttribute('aria-label'))!)
    expect(screen.getByRole('button', { name: 'Projetado' }).getAttribute('aria-pressed')).toBe('true')
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/cash-flow?startDate='), { scroll: false })
  })

  it('seta para um mês todo no futuro, em Realizado, passa para Projetado', () => {
    render(<CashFlowClient {...props} startDate="2026-10-01" endDate="2026-10-31" />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Próximo mês' }).find((b) => b.hasAttribute('aria-label'))!)
    expect(screen.getByRole('button', { name: 'Projetado' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('abre em Projetado quando o recorte é todo no futuro', () => {
    render(<CashFlowClient {...props} startDate="2026-12-01" endDate="2027-02-28" />)
    expect(screen.getByRole('button', { name: 'Projetado' }).getAttribute('aria-pressed')).toBe('true')
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
        startDate="2025-11-01"
        endDate="2026-10-18"
        accountIds={['a2']}
      />,
    )
    const receitas = () => screen.getByText(/^Receitas/, { selector: 'p' }).nextElementSibling!.textContent
    expect(receitas()).toContain('300,00')
  })

  it('marcar uma conta grava accountId na URL', () => {
    replace.mockClear()
    render(
      <CashFlowClient
        transactions={[]}
        futureTransactions={[]}
        accounts={[{ id: 'a1', name: 'Itaú' }, { id: 'a2', name: 'Nubank' }]}
        startDate="2025-11-01"
        endDate="2026-10-18"
        accountIds={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Todas as contas/ }))
    fireEvent.click(screen.getByText('Nubank'))
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('accountId=a2'), { scroll: false })
  })
})
