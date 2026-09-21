import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

/**
 * Um filtro se desliga onde foi ligado.
 *
 * Antes, marcar "Este mês" era um clique e desmarcar era outro: achar o botão
 * "Limpar" — que ficava longe da pílula, aparecia e desaparecia conforme o
 * estado e levava embora TODOS os filtros de uma vez. Quem queria só soltar o
 * período perdia a busca e a conta no mesmo clique.
 *
 * Agora cada controle é o próprio interruptor: a pílula ativa clicada volta ao
 * neutro, a busca tem o × dentro do campo, cada data tem o seu. Nenhum clique
 * mexe em filtro que o usuário não tocou.
 */

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}))

const { TransactionFilters } = await import('@/components/finance/transaction-filters')

const urlDoUltimoReplace = () => new URL(replace.mock.calls.at(-1)![0], 'http://x')

const clicar = async (nome: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nome }))
  })
}

beforeEach(() => {
  replace.mockClear()
  params = new URLSearchParams()
})

describe('filtros de transações', () => {
  it('a pílula de período ativa, clicada, solta o recorte de data', async () => {
    const hoje = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    params = new URLSearchParams({
      startDate: fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
      endDate: fmt(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
    })

    render(<TransactionFilters accounts={[]} hideAccountFilter />)
    expect(screen.getByRole('button', { name: 'Este mês' }).getAttribute('aria-pressed')).toBe('true')

    await clicar('Este mês')

    const url = urlDoUltimoReplace()
    expect(url.searchParams.get('startDate')).toBeNull()
    expect(url.searchParams.get('endDate')).toBeNull()
  })

  it('a busca se apaga pelo × do próprio campo, sem levar o resto', async () => {
    params = new URLSearchParams({ search: 'padaria', accountId: 'acc-1' })
    render(<TransactionFilters accounts={[{ id: 'acc-1', name: 'Itaú' }]} />)

    await clicar('Limpar busca')

    const url = urlDoUltimoReplace()
    expect(url.searchParams.get('search')).toBeNull()
    expect(url.searchParams.get('accountId')).toBe('acc-1')
  })

  it('cada data tem o seu ×, e a outra ponta fica de pé', async () => {
    params = new URLSearchParams({ startDate: '2026-01-01', endDate: '2026-01-31' })
    render(<TransactionFilters accounts={[]} hideAccountFilter />)

    await clicar('Limpar data inicial')

    const url = urlDoUltimoReplace()
    expect(url.searchParams.get('startDate')).toBeNull()
    expect(url.searchParams.get('endDate')).toBe('2026-01-31')
  })

  it('não existe mais botão que limpa tudo de uma vez', () => {
    params = new URLSearchParams({ search: 'padaria', startDate: '2026-01-01' })
    render(<TransactionFilters accounts={[]} hideAccountFilter />)

    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  it('o toggle do futuro se chama "Lançamentos futuros"', () => {
    render(<TransactionFilters accounts={[]} hideAccountFilter />)

    expect(screen.getByRole('button', { name: 'Lançamentos futuros' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /previs/i })).toBeNull()
  })
})
