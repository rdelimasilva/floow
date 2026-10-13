import { describe, expect, it, vi } from 'vitest'
import { carregarMesesDasFaturas, completarMesDaFatura } from '@/lib/openfinance/mes-da-fatura'

/** Fatura de outubro do Master Black: fecha 09/10, vence 16/10. */
const BILL = '01a13333-b1c6-738a-a903-410d2753f7b7'

describe('carregarMesesDasFaturas', () => {
  it('lê o mês do vencimento no fuso de São Paulo', async () => {
    // Vencimento em 01/10 chega como 01/10 03:00Z; às 02:00Z ainda seria 30/09.
    const client: any = { listCardBills: async () => [{ id: BILL, due_date: '2026-10-01T03:00:00.000000Z' }, { id: 'set', due_date: '2026-10-01T02:00:00.000000Z' }] }

    const meses = await carregarMesesDasFaturas(client, 'cartao')
    expect(meses.get('set')).toBe('2026-09')
    expect(meses.get(BILL)).toBe('2026-10')
  })

  it('falha da Polp não derruba o sync: segue sem meses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client: any = { listCardBills: async () => { throw new Error('503') } }

    expect((await carregarMesesDasFaturas(client, 'cartao')).size).toBe(0)
  })
})

describe('completarMesDaFatura', () => {
  const meses = new Map([[BILL, '2026-10']])

  it('preenche o mês da parcela que só trouxe o bill_id', () => {
    expect(completarMesDaFatura({ billId: BILL, billForecastMonth: null }, meses).billForecastMonth).toBe('2026-10')
  })

  it('o mês que a transação traz vale mais', () => {
    expect(completarMesDaFatura({ billId: BILL, billForecastMonth: '2026-11' }, meses).billForecastMonth).toBe('2026-11')
  })

  it('sem bill_id ou com fatura desconhecida, nada muda', () => {
    expect(completarMesDaFatura({ billId: null, billForecastMonth: null }, meses).billForecastMonth).toBeNull()
    expect(completarMesDaFatura({ billId: 'outra', billForecastMonth: null }, meses).billForecastMonth).toBeNull()
  })
})
