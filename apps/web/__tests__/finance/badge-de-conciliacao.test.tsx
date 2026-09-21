import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O contador precisa aparecer no menu, senão a fila não bloqueante é uma tela
 * que ninguém lembra de visitar — e a previsão fica esperando decisão para
 * sempre.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/components/layout/sidebar-context', () => ({
  useSidebar: () => ({ pinned: true, togglePin: () => {} }),
}))

const { Sidebar } = await import('@/components/layout/sidebar')

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
})
