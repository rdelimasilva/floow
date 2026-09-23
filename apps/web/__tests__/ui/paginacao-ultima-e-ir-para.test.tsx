import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

/**
 * A paginação dos lançamentos vai direto às pontas e a qualquer página.
 *
 * Só com Anterior/Próxima, chegar numa página distante era clicar dezenas de
 * vezes. Agora há Primeira/Última e um campo "Ir para" que aceita o número e
 * encosta nos limites quando ele passa do que existe.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { Pagination } = await import('@/components/ui/pagination')

const filtros = { accountId: 'a1', startDate: '2026-01-01' }

function renderPagina(currentPage: number, totalPages = 12) {
  return render(
    <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/transactions" searchParams={filtros} />,
  )
}

const hrefDe = (nome: string) => new URL(screen.getByRole('link', { name: nome }).getAttribute('href')!, 'http://x')

beforeEach(() => push.mockClear())

describe('paginação', () => {
  it('Última leva à última página mantendo os filtros', () => {
    renderPagina(3)
    const url = hrefDe('Última')
    expect(url.pathname).toBe('/transactions')
    expect(url.searchParams.get('page')).toBe('12')
    expect(url.searchParams.get('accountId')).toBe('a1')
    expect(url.searchParams.get('startDate')).toBe('2026-01-01')
  })

  it('Primeira leva à página 1', () => {
    renderPagina(3)
    expect(hrefDe('Primeira').searchParams.get('page')).toBe('1')
  })

  it('nas pontas, o botão da própria ponta some', () => {
    const { unmount } = renderPagina(12)
    expect(screen.queryByRole('link', { name: 'Última' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Próxima' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Primeira' })).toBeTruthy()
    unmount()

    renderPagina(1)
    expect(screen.queryByRole('link', { name: 'Primeira' })).toBeNull()
  })

  it('Ir para navega à página digitada, com os filtros', () => {
    renderPagina(3)
    const campo = screen.getByLabelText('Ir para a página')
    fireEvent.change(campo, { target: { value: '7' } })
    fireEvent.submit(campo)

    expect(push).toHaveBeenCalledTimes(1)
    const url = new URL(push.mock.calls[0][0], 'http://x')
    expect(url.searchParams.get('page')).toBe('7')
    expect(url.searchParams.get('accountId')).toBe('a1')
  })

  it('número fora da faixa encosta no limite', () => {
    renderPagina(3)
    const campo = screen.getByLabelText('Ir para a página')
    fireEvent.change(campo, { target: { value: '99' } })
    fireEvent.submit(campo)
    expect(new URL(push.mock.calls[0][0], 'http://x').searchParams.get('page')).toBe('12')

    fireEvent.change(campo, { target: { value: '0' } })
    fireEvent.submit(campo)
    expect(new URL(push.mock.calls[1][0], 'http://x').searchParams.get('page')).toBe('1')
  })

  it('campo vazio ou a própria página atual não navega', () => {
    renderPagina(3)
    const campo = screen.getByLabelText('Ir para a página')
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.submit(campo)
    fireEvent.change(campo, { target: { value: '3' } })
    fireEvent.submit(campo)
    expect(push).not.toHaveBeenCalled()
  })
})
