import { describe, expect, it } from 'vitest'
import { inicioDoHistorico, noHistorico, pagamentosDoHistorico } from '@/lib/openfinance/inicio-do-cartao'

/**
 * Master Black reprocessado pela Polp: primeira compra em 16/10/2025, no meio
 * da fatura que fechou em 09/11/2025 (R$ 11.413,57, paga em 17/11; mais
 * R$ 20.150 em 24/11).
 */

const fatura = (fechamento: string, total: string): any => ({
  id: fechamento, credit_card_id: 'c', due_date: `${fechamento}T03:00:00.000000Z`,
  bill_closing_date: `${fechamento}T03:00:00.000000Z`, bill_total_amount: { amount: total, currency: 'BRL' },
  created_at: '', updated_at: '',
})
const faturas = [fatura('2025-09-09', '9270.40'), fatura('2025-10-09', '12731.41'), fatura('2025-11-09', '11413.57'), fatura('2025-12-09', '15893.16')]
const pg = (date: string, amountCents: number) => ({ date, amountCents })

describe('inicioDoHistorico', () => {
  it('começa depois da primeira fatura que o histórico alcança', () => {
    expect(inicioDoHistorico('2025-10-16', faturas, 9)).toBe('2025-11-10')
  })

  it('compra no dia do fechamento: essa fatura é a incompleta', () => {
    expect(inicioDoHistorico('2025-11-09', faturas, 9)).toBe('2025-11-10')
  })

  it('sem faturas do banco, pelo dia de fechamento cadastrado', () => {
    expect(inicioDoHistorico('2025-10-16', [], 8)).toBe('2025-11-09')
    expect(inicioDoHistorico('2025-10-05', [], 8)).toBe('2025-10-09')
  })

  it('sem faturas e sem dia de fechamento, não há como saber', () => {
    expect(inicioDoHistorico('2025-10-16', [], null)).toBeNull()
  })
})

describe('pagamentosDoHistorico', () => {
  const pagamentos = [
    pg('2025-09-16', 927040), pg('2025-09-24', 57989), pg('2025-10-16', 1273141),
    pg('2025-11-17', 1141357), pg('2025-11-24', 2015000), pg('2025-12-16', 1589316),
  ]

  it('fica de fora o que quitou a dívida de antes do início; o excedente conta', () => {
    const contam = pagamentosDoHistorico(pagamentos, faturas, '2025-11-10')
    expect(contam).toEqual([pg('2025-11-24', 2015000), pg('2025-12-16', 1589316)])
  })

  it('Visa: R$ 1.151,67 quitam a fatura de 08/11; os R$ 934,21 de 24/11 contam', () => {
    const visa = [fatura('2025-11-08', '1151.67')]
    expect(pagamentosDoHistorico([pg('2025-11-17', 115167), pg('2025-11-24', 93421)], visa, '2025-11-09'))
      .toEqual([pg('2025-11-24', 93421)])
  })
})

describe('noHistorico', () => {
  it('pela data', () => {
    expect(noHistorico({ date: '2025-11-10', billForecastMonth: null }, '2025-11-10')).toBe(true)
    expect(noHistorico({ date: '2025-11-09', billForecastMonth: null }, '2025-11-10')).toBe(false)
  })

  it('parcela de compra antiga que cai numa fatura do histórico entra', () => {
    expect(noHistorico({ date: '2025-10-20', billForecastMonth: '2025-12' }, '2025-11-10')).toBe(true)
  })
})
