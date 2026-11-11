/**
 * Cartões no recorte: período por fechamento da fatura, cartão e categoria por id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

const replace = vi.fn()
let busca = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(busca),
}))
vi.mock('next/dynamic', () => ({
  default: () => (p: { meses: { mes: string; totalCents: number }[] }) =>
    React.createElement('div', { 'data-testid': 'grafico' }, p.meses.map((m) => `${m.mes}=${m.totalCents}`).join(';')),
}))
vi.mock('@/components/finance/cash-flow-lancamento-dialog', () => ({ CashFlowLancamentoDialog: () => null }))

import { GastosDosCartoes } from '@/components/finance/gastos-dos-cartoes'
import { janelaDasFaturas } from '@/lib/finance/queries-gastos-cartao'
import { destinoSoComContasValidas } from '@/lib/finance/url-do-menu'

const fatura = (fechamento: string, porCategoria: Record<string, number>) => ({
  fechamento, totalCents: Object.values(porCategoria).reduce((a, b) => a + b, 0), porCategoria, lancamentos: [],
})
const cartoes = [
  { id: 'c1', name: 'Itaú', titular: null, faturas: [fatura('2026-09-10', { Mercado: 100, Lazer: 50 }), fatura('2026-10-10', { Mercado: 200, Lazer: 30 })] },
  { id: 'c2', name: 'Nubank', titular: null, faturas: [fatura('2026-10-05', { Mercado: 1000 })] },
]
const base = {
  cartoes, metas: {}, hoje: '2026-10-20', startDate: '', endDate: '', accountIds: [] as string[], categoryIds: [] as string[],
  categoriasDeCima: [{ id: 'k1', name: 'Mercado' }, { id: 'k2', name: 'Lazer' }],
}
const grafico = () => screen.getByTestId('grafico').textContent

describe('Cartões no recorte', () => {
  beforeEach(() => { replace.mockClear(); busca = '' })

  it('mostra só o cartão marcado', () => {
    render(<GastosDosCartoes {...base} accountIds={['c1']} />)
    expect(grafico()).toBe('2026-09=150;2026-10=230')
  })

  it('fatura e categoria viram link só com um cartão na tela', () => {
    const lanc = (id: string, date: string, categoryName: string) => ({ id, date, description: id, amountCents: -100, categoryName, subcategoria: null })
    const comLancamentos = cartoes.map((c) => ({
      ...c, faturas: c.faturas.map((f) => ({ ...f, lancamentos: [lanc(`${c.id}a`, '2026-09-20', 'Mercado'), lanc(`${c.id}b`, '2026-10-17', 'Lazer')] })),
    }))
    const props = { ...base, cartoes: comLancamentos, arvoreDeCategorias: [{ id: 'k1', parentId: null }, { id: 'k1f', parentId: 'k1' }] }
    const { unmount } = render(<GastosDosCartoes {...props} />)
    expect(screen.queryByText('Ver os lançamentos da fatura')).toBeNull()
    unmount()
    render(<GastosDosCartoes {...props} accountIds={['c1']} />)
    expect(screen.getByText('Ver os lançamentos da fatura').getAttribute('href'))
      .toBe('/transactions?accountId=c1&startDate=2026-09-20&endDate=2026-10-17&fatura=2026-10-10')
    fireEvent.click(screen.getAllByRole('button', { name: /Mercado/ }).find((b) => b.hasAttribute('aria-expanded'))!)
    expect(screen.getByText('Ver em Transações').getAttribute('href')).toContain('categoryIds=k1%2Ck1f&fatura=2026-10-10')
  })

  it('conta corrente do recorte sai da URL sem mexer no cookie', () => {
    const destino = destinoSoComContasValidas({ accountId: 'cc,c1', startDate: '2026-09-01' }, ['c1', 'c2'], '/cash-flow/cartoes')
    expect(destino).toBe('/cash-flow/cartoes?accountId=c1&startDate=2026-09-01')
    // Nenhuma válida: abre em "Todos os cartões".
    expect(destinoSoComContasValidas({ accountId: 'cc' }, ['c1'], '/cash-flow/cartoes')).toBe('/cash-flow/cartoes?')
  })

  it('categoria por id soma as marcadas e vai para categoryIds, fora do recorte', () => {
    render(<GastosDosCartoes {...base} categoryIds={['k2']} />)
    expect(grafico()).toBe('2026-09=50;2026-10=30')
    fireEvent.click(screen.getAllByRole('button', { name: /Lazer/ }).find((b) => b.hasAttribute('aria-expanded') && b.textContent === 'Lazer')!)
    fireEvent.click(screen.getByLabelText('Mercado'))
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('categoryIds=k2%2Ck1'), { scroll: false })
    expect(document.cookie).not.toContain('k1')
  })

  it('id de categoria que não existe não filtra', () => {
    render(<GastosDosCartoes {...base} categoryIds={['fantasma']} />)
    expect(grafico()).toContain('2026-10=1230')
  })

  it('trocar o cartão grava accountId', () => {
    render(<GastosDosCartoes {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /Todos os cartões/ }))
    fireEvent.click(screen.getByLabelText('Nubank'))
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('accountId=c2'), { scroll: false })
  })
})

describe('janelaDasFaturas', () => {
  it('de 01/09 a 31/10 corta pelo fechamento e busca compras desde agosto', () => {
    const j = janelaDasFaturas('2026-09-01', '2026-10-31', '2026-11-11')
    expect(j.primeiroFechamento).toBe('2026-09-01')
    expect(j.ultimoFechamento).toBe('2026-10-31')
    expect(j.desde?.toISOString().slice(0, 10)).toBe('2026-08-01')
  })
  it('sem período, as últimas 12 como antes', () => {
    const j = janelaDasFaturas('', '', '2026-11-11')
    expect(j.primeiroFechamento).toBe('2025-11-01')
    expect(j.desde?.toISOString().slice(0, 10)).toBe('2025-10-01')
    expect(j.ultimoFechamento).toBe('')
  })
  it('só data final: começo aberto, sem limite de busca', () => {
    expect(janelaDasFaturas('', '2026-10-31', '2026-11-11')).toEqual({ desde: null, primeiroFechamento: '', ultimoFechamento: '2026-10-31' })
  })
})
