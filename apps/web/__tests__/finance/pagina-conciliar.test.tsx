import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * O modo foco mostra um lançamento do banco por vez (spec 2026-10-01). Aqui
 * fica o que é da página: carregar a fila, o link para Regras, `?regra=`
 * indo direto para lá e o "Tudo conciliado" quando não sobra nada. O
 * comportamento da fila em si (atalhos, fases, progresso) está em
 * fila-foco.test.tsx.
 */

const carregarFila = vi.fn()
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

vi.mock('@/lib/finance/conciliacao/fila-db', () => ({ carregarFila }))
vi.mock('@/lib/finance/queries', () => ({
  getOrgId: async () => 'org-1',
  getCategories: async () => [],
  getAccounts: async () => [],
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/components/finance/conciliar/fila-foco', async () => {
  const React = await import('react')
  return {
    FilaFoco: ({ total }: { total: number }) =>
      React.createElement('div', { 'data-testid': 'fila', 'data-total': total }),
  }
})

const { default: ConciliarPage } = await import('@/app/(app)/transactions/conciliar/page')

async function montar(params: { regra?: string } = {}) {
  render(await ConciliarPage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  carregarFila.mockReset().mockResolvedValue({ itens: [], total: 3 })
  redirect.mockClear()
})

describe('tela Conciliar', () => {
  it('renderiza a fila com o total', async () => {
    await montar()

    expect(screen.getByTestId('fila').getAttribute('data-total')).toBe('3')
  })

  it('o link "Regras" aponta para /transactions/conciliar/regras', async () => {
    await montar()

    expect(screen.getByRole('link', { name: 'Regras' }).getAttribute('href')).toBe(
      '/transactions/conciliar/regras',
    )
  })

  it('?regra=cp-1 redireciona para a tela de Regras', async () => {
    await expect(montar({ regra: 'cp-1' })).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/transactions/conciliar/regras?regra=cp-1')
  })

  it('com total 0, diz "Tudo conciliado"', async () => {
    carregarFila.mockResolvedValue({ itens: [], total: 0 })

    await montar()

    screen.getByText('Tudo conciliado')
    expect(screen.queryByTestId('fila')).toBeNull()
  })
})
