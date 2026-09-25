import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let caminho = '/investments'
vi.mock('next/navigation', () => ({ usePathname: () => caminho }))

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
})
