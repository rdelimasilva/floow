import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React, { useContext } from 'react'

let params = new URLSearchParams('nova=1&search=mercado')
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
  useRouter: () => ({ replace }),
  usePathname: () => '/transactions',
}))
vi.mock('@/components/finance/transaction-form', () => ({ TransactionForm: () => null }))

import { InlineTransactionFormProvider, InlineFormContext } from '@/components/finance/inline-transaction-form'

function Estado() {
  return <span>{useContext(InlineFormContext)?.open ? 'aberto' : 'fechado'}</span>
}

/** A paleta e o atalho N chegam em /transactions?nova=1: o formulário já abre. */
describe('nova transação pela URL', () => {
  it('abre o formulário e tira o parâmetro, mantendo os filtros', () => {
    render(<InlineTransactionFormProvider><Estado /></InlineTransactionFormProvider>)
    expect(screen.getByText('aberto')).toBeTruthy()
    expect(replace).toHaveBeenCalledWith('/transactions?search=mercado', { scroll: false })
  })

  it('sem o parâmetro, começa fechado', () => {
    params = new URLSearchParams('search=mercado')
    render(<InlineTransactionFormProvider><Estado /></InlineTransactionFormProvider>)
    expect(screen.getByText('fechado')).toBeTruthy()
  })
})
