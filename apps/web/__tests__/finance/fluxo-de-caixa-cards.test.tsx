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

// O jsdom não implementa o modal do <dialog>.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

vi.mock('next/dynamic', () => ({
  default: () => () => React.createElement('div', { 'data-testid': 'grafico' }),
}))

vi.mock('@/lib/finance/fluxo-de-caixa-actions', () => ({
  getDetalheDoLancamento: vi.fn(async (id: string) => ({
    id, date: '2026-10-02', description: 'Aluguel', amountCents: -200_00, type: 'expense',
    accountId: 'a1', accountName: 'Itaú', categoryName: 'Moradia', origem: 'extrato',
    balanceApplied: true, recorrente: false, installmentNumber: null, installmentTotal: null,
    purchaseDate: null, cardLastDigits: null,
  })),
}))

import { CashFlowClient } from '@/components/finance/cash-flow-client'

describe('cards × total do detalhamento', () => {
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

  it('"Ocultar transferências" desligado conta a entrada como receita e a saída como despesa', () => {
    render(
      <CashFlowClient
        transactions={[...transactions, tx('2026-10-10', 1000_00, 'transfer'), tx('2026-10-11', -400_00, 'transfer')]}
        futureTransactions={[]}
        accounts={[{ id: 'a1', name: 'Conta' }]}
      />,
    )
    expect(card(/^Receitas/)).toContain('600,00')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar transferências' }))
    expect(card(/^Receitas/)).toContain('1.600,00')
    expect(card(/^Despesas/)).toContain('630,00')
  })

  it('clicar na despesa do mês abre os lançamentos que formam a soma', () => {
    render(
      <CashFlowClient
        transactions={transactions.map((t, i) => ({ ...t, description: `Lançamento ${i}` }))}
        futureTransactions={[]}
        accounts={[{ id: 'a1', name: 'Conta' }]}
      />,
    )
    const linha = screen.getByText('Outubro de 2026').closest('tr')!
    fireEvent.click(within(linha).getByRole('button', { name: /230,00/ }))
    expect(screen.getByText(/2 lançamentos/)).toBeTruthy()
    expect(screen.getByText('Lançamento 1')).toBeTruthy()
    expect(screen.getByText('Lançamento 3')).toBeTruthy()
    expect(screen.queryByText('Lançamento 0')).toBeNull()
  })

  it('o período escolhido volta quando a pessoa retorna à tela', () => {
    const tela = () => (
      <CashFlowClient transactions={transactions} futureTransactions={[]} accounts={[{ id: 'a1', name: 'Conta' }]} />
    )
    const { unmount } = render(tela())
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    unmount()

    render(tela())
    expect(card(/^Receitas/)).toContain('100,00')
    expect(card(/^Receitas/)).not.toContain('600,00')
  })

  it('clicar num lançamento da lista abre o popup com os detalhes', async () => {
    render(
      <CashFlowClient
        transactions={transactions.map((t, i) => ({ ...t, id: `id-${i}`, description: `Lançamento ${i}` }))}
        futureTransactions={[]}
        accounts={[{ id: 'a1', name: 'Conta' }]}
      />,
    )
    const linha = screen.getByText('Outubro de 2026').closest('tr')!
    fireEvent.click(within(linha).getByRole('button', { name: /230,00/ }))
    fireEvent.click(screen.getByText('Lançamento 3'))
    const popup = await screen.findByRole('dialog')
    expect(await within(popup).findByText('Moradia')).toBeTruthy()
    expect(within(popup).getByText('Itaú')).toBeTruthy()
    expect(within(popup).getByText('Realizado')).toBeTruthy()
  })
})
