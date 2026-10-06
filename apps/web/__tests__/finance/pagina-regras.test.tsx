import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O que o floow faz sozinho com cada favorecido, fora do modo foco. Aqui
 * fica só o que é da página: a lista vazia e o repasse de `regraAberta` para
 * `RegrasConfirmadas` — o comportamento da lista em si (abrir, corrigir,
 * buscar) está em regras-confirmadas.test.tsx.
 */

const getConfirmedCounterparties = vi.fn()

vi.mock('@/lib/openfinance/counterparty-queries', () => ({ getConfirmedCounterparties }))
vi.mock('@/lib/finance/queries', () => ({
  getOrgId: async () => 'org-1',
  getCategories: async () => [],
  getAccounts: async () => [],
}))
vi.mock('@/components/openfinance/regras-confirmadas', async () => {
  const React = await import('react')
  return {
    RegrasConfirmadas: ({ confirmed, regraAberta }: { confirmed: unknown[]; regraAberta?: string }) =>
      React.createElement('div', {
        'data-testid': 'regras',
        'data-total': confirmed.length,
        'data-regra': regraAberta ?? '',
      }),
  }
})

const { default: RegrasPage } = await import('@/app/(app)/transactions/conciliar/regras/page')

async function montar(params: { regra?: string } = {}) {
  render(await RegrasPage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  getConfirmedCounterparties.mockReset().mockResolvedValue([])
})

describe('tela Regras', () => {
  it('sem regras, diz "Nenhuma regra confirmada ainda."', async () => {
    await montar()

    screen.getByText('Nenhuma regra confirmada ainda.')
    expect(screen.queryByTestId('regras')).toBeNull()
  })

  it('com regras, renderiza RegrasConfirmadas com regraAberta', async () => {
    getConfirmedCounterparties.mockResolvedValue([{ id: 'cp-1' }, { id: 'cp-2' }])

    await montar({ regra: 'cp-1' })

    const regras = screen.getByTestId('regras')
    expect(regras.getAttribute('data-total')).toBe('2')
    expect(regras.getAttribute('data-regra')).toBe('cp-1')
  })
})
