import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ usePathname: () => '/debts', useRouter: () => ({ push: vi.fn() }) }))

import { Sidebar } from '@/components/layout/sidebar'
import { SidebarProvider } from '@/components/layout/sidebar-context'

const { TransactionDesktopRow } = await import('@/components/finance/transaction-display-row')

/**
 * Leitor de tela: o item ativo do menu só era marcado pela cor, e o checkbox
 * de seleção da linha era anunciado como "caixa de seleção", sem dizer de quê.
 */
describe('acessibilidade básica', () => {
  it('menu marca a página atual', () => {
    render(<SidebarProvider defaultPinned><Sidebar mobileOpen={false} onMobileClose={() => {}} /></SidebarProvider>)
    const ativos = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(ativos.map((l) => l.getAttribute('href'))).toEqual(['/debts'])
  })

  it('checkbox da linha diz qual lançamento seleciona', () => {
    render(
      <table><tbody>
        <TransactionDesktopRow
          tx={{ id: 't1', type: 'expense', amountCents: -100, description: 'Mercado', date: '2026-09-01', accountId: 'a', categoryName: null, categoryColor: null, categoryIcon: null } as never}
          balance={0} isSelected={false} loading={false} actions={{} as never}
        />
      </tbody></table>,
    )
    expect(screen.getByRole('checkbox', { name: 'Selecionar Mercado' })).toBeTruthy()
  })
})
