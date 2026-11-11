import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let caminho = '/transactions'
let params = new URLSearchParams()
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => caminho,
  useSearchParams: () => params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

import { Sidebar } from '@/components/layout/sidebar'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { TransactionFilters } from '@/components/finance/transaction-filters'
import { serializarRecorte } from '@/lib/finance/recorte'

const hrefDe = (nome: string) => screen.getByRole('link', { name: new RegExp(nome) }).getAttribute('href')
const menu = <SidebarProvider defaultPinned><Sidebar mobileOpen={false} onMobileClose={() => {}} /></SidebarProvider>

beforeEach(() => {
  caminho = '/transactions'
  params = new URLSearchParams()
  const outubro = serializarRecorte({ startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] }, '2026-11-11')
  document.cookie = `recorte=${encodeURIComponent(outubro)}; path=/`
})

describe('menu e o recorte', () => {
  it('Gastos abre no mês do recorte', () => {
    render(menu)
    expect(hrefDe('Plano de Gastos')).toBe('/budgets/spending?month=2026-10-01')
  })

  it('chegada por link em outro mês atualiza o menu na mesma tela', () => {
    params = new URLSearchParams({ startDate: '2026-09-01', endDate: '2026-09-30' })
    // Menu antes da tela, como no layout: ele monta lendo o cookie antigo.
    render(<>{menu}<TransactionFilters accounts={[]} /></>)
    expect(hrefDe('Plano de Gastos')).toBe('/budgets/spending?month=2026-09-01')
  })

  it('dentro de Orçamentos, o mês da tela vale mais que o recorte', () => {
    caminho = '/budgets/pacing'
    params = new URLSearchParams('month=2026-08-01')
    render(menu)
    expect(hrefDe('Plano de Gastos')).toBe('/budgets/spending?month=2026-08-01')
  })
})
