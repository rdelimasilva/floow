import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O contador precisa aparecer no menu, senão a fila não bloqueante é uma tela
 * que ninguém lembra de visitar — e a previsão fica esperando decisão para
 * sempre.
 */

const usePathnameMock = vi.fn(() => '/dashboard')
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }))
vi.mock('@/components/layout/sidebar-context', () => ({
  useSidebar: () => ({ pinned: true, togglePin: () => {} }),
}))

const { Sidebar } = await import('@/components/layout/sidebar')

const ATIVO = 'bg-gray-100 text-foreground'

describe('badge de conciliações no menu', () => {
  it('mostra o item e a contagem', () => {
    render(React.createElement(Sidebar, { matchBadgeCount: 7, mobileOpen: false, onMobileClose: () => {} }))

    screen.getByText('Conciliações')
    screen.getByText('7')
  })

  it('sem pendência, não mostra número nenhum', () => {
    render(React.createElement(Sidebar, { matchBadgeCount: 0, mobileOpen: false, onMobileClose: () => {} }))

    screen.getByText('Conciliações')
    expect(screen.queryByText('0')).toBeNull()
  })

  it('em /transactions/matches, só Conciliações fica ativo, não Transações', () => {
    usePathnameMock.mockReturnValue('/transactions/matches')

    render(React.createElement(Sidebar, { matchBadgeCount: 1, mobileOpen: false, onMobileClose: () => {} }))

    const conciliacoes = screen.getByText('Conciliações').closest('a')
    const transacoes = screen.getByText('Transações').closest('a')

    expect(conciliacoes?.className).toContain(ATIVO)
    expect(transacoes?.className).not.toContain(ATIVO)

    usePathnameMock.mockReturnValue('/dashboard')
  })
})
