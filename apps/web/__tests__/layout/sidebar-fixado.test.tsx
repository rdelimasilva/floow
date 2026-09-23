import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import {
  SidebarProvider,
  SIDEBAR_COOKIE_NAME,
  useSidebar,
} from '@/components/layout/sidebar-context'

/**
 * O botao "Fixar menu aberto" grava o cookie, mas o layout so le esse cookie
 * no servidor. Quando o Next reaproveita um payload do layout gerado antes do
 * clique (cache do router em prefetch, voltar/avancar, bfcache), o provider
 * remonta com `defaultPinned` desatualizado e o menu "desfixa" sozinho, com o
 * cookie ainda dizendo que esta fixado. No cliente, quem manda e o cookie.
 */

function Estado() {
  const { pinned, togglePin } = useSidebar()
  return (
    <button type="button" onClick={togglePin}>
      {pinned ? 'fixado' : 'solto'}
    </button>
  )
}

function limparCookie() {
  document.cookie = `${SIDEBAR_COOKIE_NAME}=; path=/; max-age=0`
}

describe('menu lateral fixado', () => {
  beforeEach(limparCookie)

  it('continua fixado quando o layout chega com o valor antigo do cookie', () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=true; path=/`
    render(
      <SidebarProvider defaultPinned={false}>
        <Estado />
      </SidebarProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('fixado')
  })

  it('continua solto quando o layout chega fixado mas o cookie foi desfixado', () => {
    document.cookie = `${SIDEBAR_COOKIE_NAME}=false; path=/`
    render(
      <SidebarProvider defaultPinned={true}>
        <Estado />
      </SidebarProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('solto')
  })

  it('sem cookie, vale o que o servidor mandou', () => {
    render(
      <SidebarProvider defaultPinned={true}>
        <Estado />
      </SidebarProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('fixado')
  })

  it('fixar grava o cookie e sobrevive a uma remontagem com payload antigo', () => {
    const { unmount } = render(
      <SidebarProvider defaultPinned={false}>
        <Estado />
      </SidebarProvider>,
    )
    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button').textContent).toBe('fixado')
    expect(document.cookie).toContain(`${SIDEBAR_COOKIE_NAME}=true`)

    unmount()
    render(
      <SidebarProvider defaultPinned={false}>
        <Estado />
      </SidebarProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('fixado')
  })
})
