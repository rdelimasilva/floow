/**
 * Classificar lançamentos mostra de que conta é cada lançamento e o que o
 * extrato trouxe (meio, cartão, parcela). Sem isso, conciliar com o extrato
 * do banco é impossível: uma contraparte junta lançamentos de contas
 * diferentes no mesmo grupo.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/openfinance/counterparty-actions', () => ({
  confirmCounterparty: vi.fn(async () => ({ reclassified: 0 })),
}))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => React.createElement('select', null, children),
  SelectTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectValue: ({ placeholder }: any) => React.createElement('span', null, placeholder),
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement('option', { value }, children),
}))

import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'
import { meioDoLancamento } from '@/lib/openfinance/meio-do-lancamento'

const ACCOUNTS = [
  { id: 'itau', name: 'Itaú PJ' },
  { id: 'nubank', name: 'Nubank' },
]

const PENDING = [
  {
    counterpartyId: 'cp-1',
    displayName: 'Fornecedor X',
    keyType: 'tax_id' as const,
    count: 3,
    totalCents: -60_000,
    ehCpfProprio: false,
    items: [
      { id: 'tx-a', date: '2026-09-05', description: 'PIX ENVIADO FORNECEDOR X LTDA', amountCents: -10_000, accountId: 'itau', polpType: 'PIX', sugestaoContaId: null },
      { id: 'tx-b', date: '2026-09-12', description: 'BOLETO FORNECEDOR X', amountCents: -20_000, accountId: 'itau', polpType: 'BOLETO', sugestaoContaId: null },
      { id: 'tx-c', date: '2026-09-20', description: 'FORNECEDOR X', amountCents: -30_000, accountId: 'nubank', cardLastDigits: '4321', installmentNumber: 2, installmentTotal: 10, sugestaoContaId: null },
    ],
  },
]

function renderFila() {
  render(
    React.createElement(CounterpartyQueueClient, {
      pending: PENDING,
      confirmed: [],
      categoryOptions: [],
      accountOptions: ACCOUNTS,
    }),
  )
}

describe('Classificar — detalhes do extrato', () => {
  it('lançamentos já aparecem abertos, com a conta de cada um', () => {
    renderFila()
    within(screen.getByTestId('item-tx-a')).getByText('Itaú PJ')
    within(screen.getByTestId('item-tx-c')).getByText('Nubank')
  })

  it('cabeçalho do grupo separa quanto é de cada conta', () => {
    renderFila()
    const resumo = screen.getByTestId('contas-do-grupo-cp-1')
    expect(resumo.textContent).toContain('Itaú PJ: 2')
    expect(resumo.textContent).toContain('Nubank: 1')
  })

  it('mostra data completa, descrição do banco, meio, cartão e parcela', () => {
    renderFila()
    const a = screen.getByTestId('item-tx-a')
    within(a).getByText('05/09/2026')
    within(a).getByText('PIX ENVIADO FORNECEDOR X LTDA')
    within(a).getByText('Pix')
    within(screen.getByTestId('item-tx-b')).getByText('Boleto')
    const c = screen.getByTestId('item-tx-c')
    within(c).getByText('cartão final 4321')
    within(c).getByText('parcela 2/10')
  })
})

describe('meioDoLancamento', () => {
  it('traduz o tipo cru da Polp e ignora OUTROS e nulo', () => {
    expect(meioDoLancamento('TED')).toBe('TED')
    expect(meioDoLancamento('RESGATE_APLIC_FINANCEIRA')).toBe('Resgate de aplicação')
    expect(meioDoLancamento('OUTROS')).toBeNull()
    expect(meioDoLancamento(null)).toBeNull()
    expect(meioDoLancamento('VALOR_NOVO')).toBeNull()
  })
})
