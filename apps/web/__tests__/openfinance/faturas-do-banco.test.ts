import { describe, expect, it, vi } from 'vitest'
import {
  carregarFaturasDoBanco,
  completarMesDaFatura,
  gravarFaturasDoBanco,
  mesesDasFaturas,
  pagamentosDoBanco,
} from '@/lib/openfinance/faturas-do-banco'

/** Faturas do Master Black como o endpoint da Polp devolve. */
const OUTUBRO = '01a13333-b1c6-738a-a903-410d2753f7b7'
const fatura = (over: Record<string, unknown> = {}): any => ({
  id: OUTUBRO,
  credit_card_id: 'cartao',
  due_date: '2026-10-16T03:00:00.000000Z',
  bill_closing_date: '2026-10-09T03:00:00.000000Z',
  bill_total_amount: { amount: '11988.1000', currency: 'BRL' },
  payments: [],
  created_at: '',
  updated_at: '',
  ...over,
})
const julho = fatura({
  id: 'julho',
  due_date: '2026-07-16T03:00:00.000000Z',
  bill_closing_date: '2026-07-09T03:00:00.000000Z',
  bill_total_amount: { amount: '13913.0300', currency: 'BRL' },
  payments: [
    { amount: '1000.0000', currency: 'BRL', paymentDate: '2026-08-08' },
    { amount: '2000.0000', currency: 'BRL', paymentDate: '2026-08-05' },
    { amount: '13913.0300', currency: 'BRL', paymentDate: '2026-07-16' },
  ],
})

describe('mesesDasFaturas', () => {
  it('lê o mês do vencimento no fuso de São Paulo', () => {
    // Vencimento em 01/10 chega como 01/10 03:00Z; às 02:00Z ainda seria 30/09.
    const meses = mesesDasFaturas([fatura(), fatura({ id: 'set', due_date: '2026-10-01T02:00:00.000000Z' })])
    expect(meses.get(OUTUBRO)).toBe('2026-10')
    expect(meses.get('set')).toBe('2026-09')
  })
})

describe('carregarFaturasDoBanco', () => {
  it('falha da Polp não derruba o sync: segue sem faturas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const client: any = { listCardBills: async () => { throw new Error('503') } }

    expect(await carregarFaturasDoBanco(client, 'cartao')).toEqual([])
  })
})

describe('completarMesDaFatura', () => {
  const meses = new Map([[OUTUBRO, '2026-10']])

  it('preenche o mês da parcela que só trouxe o bill_id', () => {
    expect(completarMesDaFatura({ billId: OUTUBRO, billForecastMonth: null }, meses).billForecastMonth).toBe('2026-10')
  })

  it('o mês que a transação traz vale mais', () => {
    expect(completarMesDaFatura({ billId: OUTUBRO, billForecastMonth: '2026-11' }, meses).billForecastMonth).toBe('2026-11')
  })

  it('sem bill_id ou com fatura desconhecida, nada muda', () => {
    expect(completarMesDaFatura({ billId: null, billForecastMonth: null }, meses).billForecastMonth).toBeNull()
    expect(completarMesDaFatura({ billId: 'outra', billForecastMonth: null }, meses).billForecastMonth).toBeNull()
  })
})

describe('pagamentosDoBanco', () => {
  it('junta os pagamentos de todas as faturas, inclusive os antecipados', () => {
    expect(pagamentosDoBanco([fatura(), julho])).toEqual([
      { amountCents: 100000, date: '2026-08-08' },
      { amountCents: 200000, date: '2026-08-05' },
      { amountCents: 1391303, date: '2026-07-16' },
    ])
  })
})

describe('pagamentosDoBanco: fatura repetida', () => {
  it('a mesma fatura devolvida com outro id conta uma vez', () => {
    expect(pagamentosDoBanco([julho, { ...julho, id: 'julho-de-novo' }])).toHaveLength(3)
  })

  it('dois pagamentos iguais na mesma fatura são dois', () => {
    const fev = fatura({ id: 'fev', bill_closing_date: '2026-02-08T03:00:00.000000Z', payments: [
      { amount: '1998.9200', currency: 'BRL', paymentDate: '2026-02-01' },
      { amount: '1998.9200', currency: 'BRL', paymentDate: '2026-02-01' },
    ] })
    expect(pagamentosDoBanco([fev])).toHaveLength(2)
  })
})

describe('gravarFaturasDoBanco', () => {
  it('grava fechamento, vencimento e o total como dívida (negativo)', async () => {
    let gravadas: any[] = []
    const db: any = { insert: () => ({ values: (v: any[]) => { gravadas = v; return { onConflictDoUpdate: async () => {} } } }) }

    await gravarFaturasDoBanco(db, 'org', 'conta', [fatura()])

    expect(gravadas[0]).toMatchObject({
      billId: OUTUBRO, fechamento: '2026-10-09', vencimento: '2026-10-16', totalCents: -1198810,
    })
  })
})
