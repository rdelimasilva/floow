/**
 * Tela Fluxo de Caixa: cards e detalhamento contam a mesma coisa.
 *
 * Revisão de 18/10/2026: com "Últimos 12m", os cards mostravam R$ 778k /
 * R$ 784k e o total da tabela R$ 738k / R$ 771k (conferido no banco). Os
 * cards somavam o resumo MENSAL filtrado por mês — outubro/2025 entrava
 * inteiro —, enquanto a tabela somava os lançamentos filtrados por DIA, só a
 * partir de 18/10/2025. Qualquer período que corta um mês ao meio ("Hoje", ou
 * o projetado até hoje) continuava divergindo mesmo com o período em meses
 * inteiros.
 *
 * Regra: os cards saem dos mesmos lançamentos que alimentam a tabela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'

vi.mock('next/dynamic', () => ({
  default: () => () => React.createElement('div', { 'data-testid': 'grafico' }),
}))

import { CashFlowClient } from '@/components/finance/cash-flow-client'

describe('cards × total do detalhamento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  const tx = (date: string, amountCents: number, type: string) => ({ date, amountCents, type, accountId: 'a1' })

  // Lançamentos de outubro/2026: um hoje, outros antes de hoje.
  const transactions = [
    tx('2026-10-18', 100_00, 'income'),
    tx('2026-10-18', -30_00, 'expense'),
    tx('2026-10-05', 500_00, 'income'),
    tx('2026-10-02', -200_00, 'expense'),
  ]
  // O resumo mensal soma o mês inteiro, como a consulta do servidor.
  const monthlyRealized = [{ month: '2026-10', income: 600_00, expense: -230_00, net: 370_00 }]

  function totaisDoDetalhamento() {
    const linhaTotal = screen.getByText('Total').closest('tr')!
    const celulas = within(linhaTotal).getAllByRole('cell')
    return { receitas: celulas[1].textContent, despesas: celulas[2].textContent }
  }

  function card(rotulo: RegExp) {
    return screen.getByText(rotulo, { selector: 'p' }).nextElementSibling!.textContent
  }

  it('em "Hoje", os cards somam só o que a tabela mostra', () => {
    render(
      <CashFlowClient
        transactions={transactions}
        futureTransactions={[]}
        monthlyRealized={monthlyRealized}
        monthlyProjected={[]}
        accounts={[{ id: 'a1', name: 'Conta' }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))

    const tabela = totaisDoDetalhamento()
    expect(card(/^Receitas/)).toBe(tabela.receitas)
    expect(card(/^Despesas/)).toBe(tabela.despesas)
    expect(tabela.receitas).toContain('100,00')
  })
})
