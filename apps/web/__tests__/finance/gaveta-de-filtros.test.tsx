import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * No celular, tipo, categoria, valor e ordem vivem numa gaveta aberta pelo
 * botão "Filtros". O contador soma tudo o que está lá dentro.
 */

let params = new URLSearchParams()
const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}))

const { TransactionFilters } = await import('@/components/finance/transaction-filters')

const CATEGORIAS = [{ id: 'a', name: 'Mercado' }, { id: 'b', name: 'Lazer' }]
const botao = () => screen.getByRole('button', { name: /^Filtros/ })
const abrir = () => {
  render(<TransactionFilters accounts={[]} hideAccountFilter categories={CATEGORIAS} />)
  fireEvent.click(botao())
  return within(screen.getByRole('dialog', { name: 'Filtros' }))
}
const ultimaUrl = () => new URL(replace.mock.calls.at(-1)![0], 'http://x').searchParams

describe('gaveta de filtros', () => {
  beforeEach(() => { replace.mockClear(); params = new URLSearchParams() })

  it('o contador soma tipo e categoria', () => {
    params = new URLSearchParams({ types: 'expense', categoryIds: 'a' })
    render(<TransactionFilters accounts={[]} hideAccountFilter categories={CATEGORIAS} />)
    expect(botao().textContent).toBe('Filtros2')
  })

  it('desmarcar a categoria dentro da gaveta tira categoryIds da URL', () => {
    params = new URLSearchParams({ types: 'expense', categoryIds: 'a' })
    const gaveta = abrir()
    fireEvent.click(gaveta.getByRole('checkbox', { name: 'Mercado' }))
    const url = ultimaUrl()
    expect(url.has('categoryIds')).toBe(false)
    expect(url.get('types')).toBe('expense')
  })

  it('a ordenação escreve sortBy e sortDir', () => {
    const gaveta = abrir()
    fireEvent.change(gaveta.getByLabelText('Ordenar por'), { target: { value: 'amountCents' } })
    expect(ultimaUrl().get('sortBy')).toBe('amountCents')
    fireEvent.change(gaveta.getByLabelText('Direção da ordem'), { target: { value: 'desc' } })
    expect(ultimaUrl().get('sortDir')).toBe('desc')
  })

  it('"Ver resultados" fecha a gaveta', () => {
    const gaveta = abrir()
    fireEvent.click(gaveta.getByRole('button', { name: 'Ver resultados' }))
    expect(screen.queryByRole('button', { name: 'Ver resultados' })).toBeNull()
  })
})
