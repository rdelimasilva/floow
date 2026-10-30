import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { getPeriodDates } from '@/lib/finance/filtros-lembrados'

/**
 * No celular, conta lembrada da última visita ficava escondida atrás do botão
 * "Filtros" sem sinal nenhum quando havia um período de atalho escolhido. O
 * botão agora mostra quantos filtros estão ativos lá dentro.
 */

let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => params,
}))

const { TransactionFilters } = await import('@/components/finance/transaction-filters')

const CONTAS = [{ id: 'acc-1', name: 'Itaú' }]
const botao = () => screen.getByRole('button', { name: /^Filtros/ })

describe('TransactionFilters — contador do botão Filtros', () => {
  it('conta a conta lembrada mesmo com período de atalho', () => {
    const { startDate, endDate } = getPeriodDates('month')
    params = new URLSearchParams({ accountId: 'acc-1', startDate, endDate })
    render(<TransactionFilters accounts={CONTAS} />)
    expect(botao().textContent).toBe('Filtros1')
  })

  it('sem filtro escondido, não mostra número', () => {
    params = new URLSearchParams()
    render(<TransactionFilters accounts={CONTAS} />)
    expect(botao().textContent).toBe('Filtros')
  })
})
