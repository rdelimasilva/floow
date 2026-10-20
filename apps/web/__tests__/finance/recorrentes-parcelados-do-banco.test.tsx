import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import { agruparParceladosNoCartao, type ParcelaDoCartao } from '@floow/core-finance'

/**
 * Parcelado que o banco já mandou inteiro aparece em Recorrentes como série
 * (próxima parcela em "Próximas a vencer" e na seção própria), sem virar
 * recorrência. O lançado à mão já é recorrência e não aparece duas vezes.
 */

vi.mock('@/lib/finance/recurring-actions', () => ({
  createRecurringTemplate: vi.fn(),
  updateRecurringTemplate: vi.fn(),
  deleteRecurringTemplate: vi.fn(),
  toggleRecurringActive: vi.fn(),
  generateRecurringTransaction: vi.fn(),
}))
vi.mock('@/lib/finance/category-actions', () => ({ createCategory: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { RecurringTemplateList } = await import('@/components/finance/recurring-template-list')

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T12:00:00-03:00'))
})
afterAll(() => vi.useRealTimers())

function parcela(compra: string, n: number, total: number, date: string, over: Partial<ParcelaDoCartao> = {}): ParcelaDoCartao {
  return { accountId: 'cartao', accountName: 'Master Black', compra, installmentNumber: n, installmentTotal: total, amountCents: 45916, date, description: `Airbnb ${n}/${total}`, ...over }
}

const parcelados = agruparParceladosNoCartao(
  [
    parcela('2026-08-01', 3, 4, '2026-11-15'),
    parcela('2026-08-01', 4, 4, '2026-12-15'),
    parcela('tpl-livelo', 2, 2, '2026-11-16', { description: 'Livelo (2/2)', amountCents: 79900, deRecorrencia: true }),
  ],
  '2026-10-20',
)

describe('Recorrentes: parcelados do banco', () => {
  it('a próxima parcela entra em "Próximas a vencer" com o número dela', () => {
    render(<RecurringTemplateList templates={[]} accounts={[]} categories={[]} parcelados={parcelados} />)
    const proximas = screen.getByRole('heading', { name: 'Próximas a vencer' }).closest('section')!
    expect(within(proximas).getByText('Airbnb')).toBeTruthy()
    expect(within(proximas).getByText(/parcela 3\/4/)).toBeTruthy()
    expect(within(proximas).getByText(/Master Black/)).toBeTruthy()
  })

  it('lista a série na seção própria, sem repetir a compra que já é recorrência', () => {
    render(<RecurringTemplateList templates={[]} accounts={[]} categories={[]} parcelados={parcelados} />)
    const secao = screen.getByRole('heading', { name: 'Parcelados no cartão' }).closest('section')!
    expect(within(secao).getByText('Airbnb')).toBeTruthy()
    expect(within(secao).getByText('15/12/2026')).toBeTruthy()
    expect(within(secao).queryByText('Livelo')).toBeNull()
    expect(screen.queryAllByText('Livelo')).toHaveLength(0)
  })
})
