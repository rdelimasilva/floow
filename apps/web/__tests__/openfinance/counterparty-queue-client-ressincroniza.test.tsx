/**
 * O CounterpartyQueueClient guarda a fila em estado local. Depois de
 * `corrigirRegra` + `router.refresh()`, o servidor manda uma fila nova (o que
 * voltou para Classificar): a tela tem de mostrá-la sem recarregar.
 *
 * Arquivo próprio para counterparty-queue-client.test.tsx não passar de 500
 * linhas; mesmos mocks de lá.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/openfinance/counterparty-actions', () => ({
  confirmCounterparty: vi.fn(async () => ({ reclassified: 0 })),
}))
vi.mock('@/lib/openfinance/corrigir-regra-actions', () => ({
  corrigirRegra: vi.fn(),
  previaCorrecaoDeRegra: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) =>
    React.createElement(
      'select',
      { value: value ?? '', onChange: (e: any) => onValueChange(e.target.value) },
      React.createElement('option', { value: '' }),
      children,
    ),
  SelectTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectValue: ({ placeholder }: any) => React.createElement('span', null, placeholder),
  SelectContent: ({ children }: any) => React.createElement(React.Fragment, null, children),
  SelectItem: ({ value, children }: any) => React.createElement('option', { value }, children),
}))

import { CounterpartyQueueClient } from '@/components/openfinance/counterparty-queue-client'

const grupo = (id: string, nome: string) => ({
  counterpartyId: id,
  displayName: nome,
  keyType: 'description' as const,
  count: 1,
  totalCents: 100_000,
  ehCpfProprio: false,
  items: [{ id: `tx-${id}`, date: '2026-07-08', description: nome, amountCents: 100_000, accountId: 'itau', type: 'transfer' as const, sugestaoContaId: null }],
})

const props = (pending: ReturnType<typeof grupo>[]) => ({
  mode: 'page' as const,
  pending,
  confirmed: [],
  categoryOptions: [],
  accountOptions: [],
})

describe('CounterpartyQueueClient — fila nova do servidor (achado 5)', () => {
  it('mostra o grupo que voltou para Classificar quando as props mudam', () => {
    const { rerender } = render(React.createElement(CounterpartyQueueClient, props([grupo('cp-a', 'Aluguel Imobiliária')])))
    expect(screen.queryByText('Resgate CDB DI')).toBeNull()

    rerender(React.createElement(CounterpartyQueueClient, props([grupo('cp-a', 'Aluguel Imobiliária'), grupo('cp-b', 'Resgate CDB DI')])))

    expect(screen.getByText('Resgate CDB DI')).toBeTruthy()
  })
})
