import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { agruparParceladosNoCartao, type ParcelaDoCartao } from '@floow/core-finance'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { ParceladosNoCartao } = await import('@/components/finance/parcelados-no-cartao')

function parcela(compra: string, n: number, total: number, date: string, amountCents: number): ParcelaDoCartao {
  return { accountId: 'c1', accountName: 'Master', compra, installmentNumber: n, installmentTotal: total, amountCents, date, description: compra }
}

const parcelados = agruparParceladosNoCartao(
  [
    parcela('Airbnb', 1, 3, '2026-11-15', 10000),
    parcela('Airbnb', 2, 3, '2026-12-15', 10000),
    parcela('Airbnb', 3, 3, '2027-01-15', 10000),
    parcela('Kalunga', 2, 2, '2026-12-15', 5000),
  ],
  '2026-10-20',
)

describe('ParceladosNoCartao: comprometimento mês a mês', () => {
  it('mostra só as compras com parcela no mês, com o número e o valor dela', () => {
    render(<ParceladosNoCartao parcelados={parcelados} selectedMonth="2027-01-01" />)
    expect(screen.getByText(/Comprometido em janeiro de 2027/)).toBeTruthy()
    const tabela = screen.getByRole('table')
    expect(within(tabela).queryByText('Kalunga')).toBeNull()
    expect(within(tabela).getByText('Airbnb')).toBeTruthy()
    expect(within(tabela).getByText('3/3')).toBeTruthy()
  })

  it('soma o mês e navega pela URL, como os orçamentos', () => {
    render(<ParceladosNoCartao parcelados={parcelados} selectedMonth="2026-12-01" />)
    const tabela = screen.getByRole('table')
    expect(within(tabela).getByText('Total do mês').closest('tr')!.textContent).toContain('150,00')

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(push).toHaveBeenCalledWith('/debts?month=2027-01-01', { scroll: false })
  })

  it('mês sem parcela diz isso em vez de lista vazia', () => {
    render(<ParceladosNoCartao parcelados={parcelados} selectedMonth="2027-05-01" />)
    expect(screen.getByText(/Nenhuma parcela de cartão em maio de 2027/)).toBeTruthy()
  })
})
