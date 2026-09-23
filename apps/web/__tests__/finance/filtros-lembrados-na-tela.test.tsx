import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { getPeriodDates, FILTERS_COOKIE } from '@/lib/finance/filtros-lembrados'

/**
 * A tela de Transações lembra a seleção e os campos mostram o que está valendo.
 *
 * - Escolher uma pílula de período preenche os campos de data com as datas
 *   dela, como se tivessem sido digitadas.
 * - Toda mudança grava a seleção no cookie ANTES de navegar, para o servidor já
 *   ler a nova escolha (inclusive "limpei tudo").
 * - Trocar período/busca/conta não leva embora filtros de coluna e ordenação.
 * - A página da conta usa o mesmo componente e não mexe na memória da tela.
 */

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}))

const { TransactionFilters } = await import('@/components/finance/transaction-filters')

const urlDoUltimoReplace = () => new URL(replace.mock.calls.at(-1)![0], 'http://x')
const cookieSalvo = () => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${FILTERS_COOKIE}=([^;]*)`))
  return m ? new URLSearchParams(decodeURIComponent(m[1])) : null
}
const dataInicial = () => (screen.getByLabelText('Data inicial') as HTMLInputElement).value
const dataFinal = () => (screen.getByLabelText('Data final') as HTMLInputElement).value

beforeEach(() => {
  replace.mockClear()
  params = new URLSearchParams()
  document.cookie = `${FILTERS_COOKIE}=; path=/; max-age=0`
})

describe('filtros lembrados na tela de transações', () => {
  it('a pílula de período preenche os campos de data com as datas dela', async () => {
    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Este trimestre' }))
    })

    const { startDate, endDate } = getPeriodDates('quarter')
    expect(dataInicial()).toBe(startDate)
    expect(dataFinal()).toBe(endDate)
    expect(urlDoUltimoReplace().searchParams.get('startDate')).toBe(startDate)
  })

  it('os campos de data mostram a seleção que veio pela URL (restaurada do último uso)', () => {
    params = new URLSearchParams({ startDate: '2026-03-05', endDate: '2026-04-17' })
    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    expect(dataInicial()).toBe('2026-03-05')
    expect(dataFinal()).toBe('2026-04-17')
  })

  it('os campos acompanham quando a URL muda sem remontar o componente', () => {
    const { rerender } = render(<TransactionFilters accounts={[]} hideAccountFilter />)
    expect(dataInicial()).toBe('')

    params = new URLSearchParams({ startDate: '2026-01-01', endDate: '2026-01-31' })
    rerender(<TransactionFilters accounts={[]} hideAccountFilter />)
    expect(dataInicial()).toBe('2026-01-01')
    expect(dataFinal()).toBe('2026-01-31')
  })

  it('grava a seleção no cookie antes de navegar, com o período como relativo', async () => {
    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Este mês' }))
    })
    expect(cookieSalvo()?.get('period')).toBe('month')
  })

  it('limpar tudo também é lembrado', async () => {
    params = new URLSearchParams({ search: 'mercado' })
    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }))
    })
    expect(cookieSalvo()?.toString()).toBe('')
  })

  it('trocar o período não leva embora filtros de coluna nem a ordenação', async () => {
    params = new URLSearchParams({ types: 'expense', categoryIds: 'c1', minAmount: '100', sortBy: 'amount', sortDir: 'desc' })
    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Este ano' }))
    })
    const url = urlDoUltimoReplace().searchParams
    expect(url.get('types')).toBe('expense')
    expect(url.get('categoryIds')).toBe('c1')
    expect(url.get('minAmount')).toBe('100')
    expect(url.get('sortBy')).toBe('amount')
    expect(url.get('sortDir')).toBe('desc')
  })

  it('a página da conta não mexe na memória da tela de transações', async () => {
    render(<TransactionFilters accounts={[]} hideAccountFilter baseUrl="/accounts/acc-1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Este mês' }))
    })
    expect(cookieSalvo()).toBeNull()
  })
})
