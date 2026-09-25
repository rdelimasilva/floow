import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }), DURACAO_COM_ACAO_MS: 8000 }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

window.matchMedia = (() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia

import { TransactionList } from '@/components/finance/transaction-list'

/**
 * Com um filtro que não casa com nada, a lista dizia "Registre sua primeira
 * transação para começar" — como se a conta estivesse vazia.
 */
describe('TransactionList vazia', () => {
  it('com filtro, diz que são os filtros que escondem os lançamentos', () => {
    render(<TransactionList transactions={[]} accounts={[]} categories={[]} comFiltro />)
    expect(screen.getByText(/Nenhuma transação com os filtros atuais/)).toBeTruthy()
    expect(screen.queryByText(/primeira transação/)).toBeNull()
  })

  it('sem filtro, convida a registrar a primeira', () => {
    render(<TransactionList transactions={[]} accounts={[]} categories={[]} />)
    expect(screen.getByText(/primeira transação/)).toBeTruthy()
  })
})
