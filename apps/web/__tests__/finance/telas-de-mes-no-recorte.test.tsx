/**
 * Orçamentos e Dívidas abrem no mês do recorte; andar o mês grava o mês inteiro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let cookiesLidos: { name: string; value: string }[] = []
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => cookiesLidos }) }))
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })
vi.mock('next/navigation', () => ({
  redirect: (u: string) => redirect(u),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}))
const replace = vi.fn()

const mesAbertoEmGastos = vi.fn()
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'o1', getCategories: async () => [] }))
vi.mock('@/lib/finance/budget-queries', () => ({
  getAllBudgetEntries: async () => [], getSpendingByCategory: async (_o: string, d: Date) => { mesAbertoEmGastos(d); return [] },
  getBudgetEntriesForMonth: async () => [], getInvestmentContributions: async () => 0,
}))
vi.mock('@/lib/finance/recurring-budget-queries', () => ({ getSpendingPlanForMonth: async () => [] }))
vi.mock('@/lib/finance/parcelas-a-vencer-queries', () => ({ getParcelasAVencerDoMes: async () => [] }))
vi.mock('@/lib/finance/budget-goal-suggestion-queries', () => ({ carregarDadosDaSugestao: async () => ({ rows: [], months: [] }), montarSugestoesDeMeta: () => [] }))
vi.mock('@/lib/finance/budgeted-spending', () => ({ rollUpSpendingToBudgeted: () => [] }))
vi.mock('@/lib/finance/simulador-orcamento', () => ({ mediaMensalPorCategoria: () => ({}) }))
vi.mock('@/lib/finance/debt-queries', () => ({ getDebtsWithProgress: async () => [] }))
vi.mock('@/lib/finance/parcelados-no-cartao-queries', () => ({ getParceladosNoCartao: async () => [{ nextDueDate: '2026-12-05' }] }))
vi.mock('@/lib/openfinance/parcelas-previstas', () => ({ hojeEmSaoPaulo: () => '2026-11-11' }))
vi.mock('@/app/(app)/budgets/spending/client', () => ({ SpendingClient: (p: { selectedMonth: string }) => React.createElement('p', null, p.selectedMonth) }))
vi.mock('@/app/(app)/budgets/investing/client', () => ({ InvestingClient: () => null }))
vi.mock('@/app/(app)/budgets/spending/simulador/client', () => ({ SimuladorClient: () => null }))
vi.mock('@/app/(app)/debts/client', () => ({ DebtsClient: () => null }))
vi.mock('@/components/finance/parcelados-no-cartao', () => ({ ParceladosNoCartao: (p: { selectedMonth: string }) => React.createElement('p', { 'data-testid': 'mes' }, p.selectedMonth) }))

import SpendingPage from '@/app/(app)/budgets/spending/page'
import InvestingPage from '@/app/(app)/budgets/investing/page'
import SimuladorPage from '@/app/(app)/budgets/spending/simulador/page'
import DebtsPage from '@/app/(app)/debts/page'
import { serializarRecorte } from '@/lib/finance/recorte'

const outubro = { startDate: '2026-10-01', endDate: '2026-10-31', accountIds: [] }
const comRecorte = () => { cookiesLidos = [{ name: 'recorte', value: serializarRecorte(outubro) }] }
const abrir = async (Page: (p: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>, sp: Record<string, string>) => {
  try { return await Page({ searchParams: Promise.resolve(sp) }) } catch (e) { return (e as Error).message }
}

describe('telas de mês seguem o recorte', () => {
  beforeEach(() => { cookiesLidos = []; redirect.mockClear() })

  it.each([
    ['Gastos', SpendingPage, '/budgets/spending'],
    ['Investimentos', InvestingPage, '/budgets/investing'],
    ['Simulador', SimuladorPage, '/budgets/spending/simulador'],
    ['Dívidas', DebtsPage, '/debts'],
  ])('%s sem month e com recorte de outubro redireciona para o mês', async (_n, Page, path) => {
    comRecorte()
    expect(await abrir(Page as never, {})).toBe(`REDIRECT:${path}?month=2026-10-01`)
  })

  it('month inválido se comporta como ausente', async () => {
    comRecorte()
    expect(await abrir(SpendingPage as never, { month: 'abc' })).toBe('REDIRECT:/budgets/spending?month=2026-10-01')
  })

  it('month válido na URL vale sobre o recorte', async () => {
    comRecorte()
    await abrir(SpendingPage as never, { month: '2026-08-01' })
    expect(redirect).not.toHaveBeenCalled()
    expect(mesAbertoEmGastos.mock.calls.at(-1)![0].getMonth()).toBe(7)
  })

  it('Dívidas com recorte só de contas não vai para o mês atual', async () => {
    cookiesLidos = [{ name: 'recorte', value: serializarRecorte({ startDate: '', endDate: '', accountIds: ['a1'] }) }]
    const r = (await abrir(DebtsPage as never, {})) as { props: { children: { props: { selectedMonth: string } }[] } }
    expect(redirect).not.toHaveBeenCalled()
    expect(r.props.children[1].props.selectedMonth).toBe('2026-12-01')
  })

  it('Dívidas sem recorte mantém a próxima fatura com parcela', async () => {
    const r = (await abrir(DebtsPage as never, {})) as { props: { children: { props: { selectedMonth: string } }[] } }
    expect(r.props.children[1].props.selectedMonth).toBe('2026-12-01')
  })
})

describe('andar o mês grava o recorte', () => {
  it('novembro vira 01/11 a 30/11 no cookie', async () => {
    const { useFiltrosNaUrl } = await import('@/components/finance/filtros/use-filtros-na-url')
    const { lerRecorte } = await import('@/lib/finance/recorte')
    function T() { const { trocar } = useFiltrosNaUrl('/budgets/spending'); return <button onClick={() => trocar({ month: '2026-11-01' })}>go</button> }
    const { fireEvent } = await import('@testing-library/react')
    render(<T />)
    fireEvent.click(screen.getByText('go'))
    expect(replace).toHaveBeenCalledWith('/budgets/spending?month=2026-11-01', { scroll: false })
    const lidos = Object.fromEntries(document.cookie.split('; ').map((c) => c.split('=') as [string, string]))
    expect(lerRecorte(lidos)).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30' })
  })
})
