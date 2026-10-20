import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { agruparParceladosNoCartao, type ParcelaDoCartao } from '@floow/core-finance'

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
  '2026-11-20',
)

describe('ParceladosNoCartao: filtro mensal', () => {
  it('mostra o comprometimento de cada mês e filtra a lista pelo mês escolhido', () => {
    render(<ParceladosNoCartao parcelados={parcelados} />)
    const grupo = screen.getByRole('group', { name: 'Comprometimento por mês' })
    expect(within(grupo).getByRole('button', { name: /dez\/26/ }).textContent).toContain('150,00')
    expect(within(grupo).getByRole('button', { name: /jan\/27/ }).textContent).toContain('100,00')

    fireEvent.click(within(grupo).getByRole('button', { name: /jan\/27/ }))
    const tabela = screen.getAllByRole('table')[0]
    expect(within(tabela).queryByText('Kalunga')).toBeNull()
    expect(within(tabela).getByText('Airbnb')).toBeTruthy()
    expect(within(tabela).getByText('3/3')).toBeTruthy()
    expect(within(tabela).getByText('Total de jan/27')).toBeTruthy()
  })
})
