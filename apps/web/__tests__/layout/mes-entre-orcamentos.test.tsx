import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let caminho = '/budgets/spending'
let params = new URLSearchParams('month=2026-08')
vi.mock('next/navigation', () => ({
  usePathname: () => caminho,
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn() }),
}))

import { Sidebar } from '@/components/layout/sidebar'
import { SidebarProvider } from '@/components/layout/sidebar-context'

/**
 * Plano de Gastos em agosto → clicar em Ritmo de Gastos voltava ao mês atual.
 * As três telas de orçamento usam `?month=`; o menu passa a levá-lo junto.
 */
function hrefDe(nome: string) {
  return screen.getByRole('link', { name: new RegExp(nome) }).getAttribute('href')
}

function montar() {
  render(<SidebarProvider defaultPinned><Sidebar mobileOpen={false} onMobileClose={() => {}} /></SidebarProvider>)
}

describe('mês entre as telas de orçamento', () => {
  it('leva o mês escolhido para as outras telas de orçamento', () => {
    montar()
    expect(hrefDe('Ritmo de Gastos')).toBe('/budgets/pacing?month=2026-08')
    expect(hrefDe('Meta de Investimentos')).toBe('/budgets/investing?month=2026-08')
  })

  it('não mexe nos links de fora do orçamento', () => {
    montar()
    expect(hrefDe('Transações')).toBe('/transactions')
  })

  it('fora do orçamento, os links de orçamento abrem no mês atual', () => {
    caminho = '/transactions'
    montar()
    expect(hrefDe('Ritmo de Gastos')).toBe('/budgets/pacing')
  })
})
