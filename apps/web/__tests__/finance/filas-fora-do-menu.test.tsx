import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * As filas nao tem item proprio no menu lateral.
 *
 * Aqui vivia `badge-de-conciliacao.test.tsx`, que prendia o contrario: item
 * "Conciliacoes" com contador, e `/transactions/matches` destacando esse item
 * em vez de "Transacoes".
 *
 * A preocupacao daquele teste continua valendo — fila nao bloqueante sem aviso
 * e tela que ninguem lembra de visitar. O que mudou foi onde o aviso mora: item
 * de menu fixo ocupa lugar permanente para uma decisao que aparece poucas vezes
 * por mes, e fica fora do campo de visao de quem esta olhando os lancamentos,
 * que e onde o assunto surge. Agora quem anuncia e `PendingQueuesNotice`, no
 * topo da lista de transacoes (ver `aviso-de-filas-pendentes.test.tsx`).
 *
 * Com as sub-rotas sem item proprio, "Transacoes" volta a ser o item destacado
 * para todas elas.
 */

const usePathnameMock = vi.fn(() => '/dashboard')
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }))
vi.mock('@/components/layout/sidebar-context', () => ({
  useSidebar: () => ({ pinned: true, togglePin: () => {} }),
}))

const { Sidebar } = await import('@/components/layout/sidebar')

const ATIVO = 'bg-gray-100 text-foreground'

describe('filas ficam fora do menu lateral', () => {
  it('não existe item "Conciliações" no menu', () => {
    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.queryByText('Conciliações')).toBeNull()
  })

  it('não existe item "Duplicatas" no menu', () => {
    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.queryByText('Duplicatas')).toBeNull()
  })

  it('em /transactions/matches, "Transações" fica ativo', () => {
    usePathnameMock.mockReturnValue('/transactions/matches')

    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.getByText('Transações').closest('a')?.className).toContain(ATIVO)
  })

  it('em /transactions/duplicates, "Transações" fica ativo', () => {
    usePathnameMock.mockReturnValue('/transactions/duplicates')

    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.getByText('Transações').closest('a')?.className).toContain(ATIVO)
  })

  it('"Recorrentes" continua com item próprio e destaque próprio', () => {
    // A excecao que sobrou: ela tem item no menu, entao nao empresta destaque
    // para "Transacoes".
    usePathnameMock.mockReturnValue('/transactions/recurring')

    render(React.createElement(Sidebar, { mobileOpen: false, onMobileClose: () => {} }))

    expect(screen.getByText('Recorrentes').closest('a')?.className).toContain(ATIVO)
    expect(screen.getByText('Transações').closest('a')?.className).not.toContain(ATIVO)
  })
})
