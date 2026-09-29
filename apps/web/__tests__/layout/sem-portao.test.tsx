import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * Nenhuma decisão tranca o app (spec 2026-09-29, §3.3). Até aqui o layout
 * trocava o app inteiro pela fila de Classificar enquanto houvesse pendência.
 *
 * O mock abaixo responde "bloqueado", como o portão responderia para uma org
 * recém-conectada. Se o layout voltar a perguntar, o app some e este teste
 * quebra.
 */

vi.mock('@/lib/openfinance/counterparty-queries', () => ({
  getReviewGateStatusSafe: async () => ({ ok: true, orgId: 'org-1', blocked: true }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/lib/auth/session', () => ({
  getShellProfile: async () => ({ email: 'ana@exemplo.com', name: 'Ana', avatarUrl: null }),
}))
vi.mock('@/components/layout/app-shell', () => ({ AppShell: () => null }))
vi.mock('@/components/layout/sidebar-layout', async () => {
  const React = await import('react')
  return { SidebarLayout: ({ children }: { children: React.ReactNode }) => React.createElement('main', null, children) }
})
vi.mock('@/components/layout/sidebar-context', async () => {
  const React = await import('react')
  return {
    SIDEBAR_COOKIE_NAME: 'sidebar-pinned',
    SidebarProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  }
})
vi.mock('@/components/providers/apply-due-provider', async () => {
  const React = await import('react')
  return { ApplyDueProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) }
})

const { default: AppLayout } = await import('@/app/(app)/layout')

describe('layout do app sem portão', () => {
  it('com lançamentos pendentes de classificar, o app renderiza normal', async () => {
    render(await AppLayout({ children: React.createElement('p', null, 'conteúdo do app') }))

    screen.getByText('conteúdo do app')
    expect(screen.queryByText('Antes de continuar')).toBeNull()
  })
})
