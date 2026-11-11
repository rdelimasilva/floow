import { describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'

let caminho = '/investments'
let query = ''
vi.mock('next/navigation', () => ({
  usePathname: () => caminho,
  useSearchParams: () => new URLSearchParams(query),
}))

import { AbasDeInvestimentos } from '@/components/investments/abas-de-investimentos'

/**
 * As abas eram estáticas: "Posicoes" ficava marcada em qualquer rota, e
 * Resumo e Renda Passiva não tinham aba nem item no menu — só se chegava
 * nelas por acaso, pelo redirect de editar um evento.
 */
function abaAtiva() {
  return screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)
}

describe('AbasDeInvestimentos', () => {
  it('expõe resumo e renda passiva', () => {
    render(<AbasDeInvestimentos />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/investments/dashboard', '/investments/income']))
  })

  it('marca a aba da rota atual, e só ela', () => {
    caminho = '/investments/income'
    render(<AbasDeInvestimentos />)
    expect(abaAtiva()).toEqual(['Renda Passiva'])
  })

  it('detalhe de um ativo fica sob Posições', () => {
    caminho = '/investments/abc-123'
    render(<AbasDeInvestimentos />)
    expect(abaAtiva()).toEqual(['Posições'])
  })

  it('leva a conta escolhida para as outras abas, sem aceitar id inválido', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    query = `accountId=${a}`
    render(<AbasDeInvestimentos />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain(`/investments/dashboard?accountId=${a}`)
    cleanup()
    query = 'accountId=<x>'
    render(<AbasDeInvestimentos />)
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toContain('/investments/dashboard')
    query = ''
  })
})
