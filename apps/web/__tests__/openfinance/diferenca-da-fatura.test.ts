import { describe, expect, it } from 'vitest'
import { faltasPorFatura, faturasFechadas, fechamentoDaLinha } from '@/lib/openfinance/diferenca-da-fatura'

/**
 * Master Black, início do histórico em 10/11/2025. A fatura de 09/11 foi
 * quitada fora do app; em 24/11 vieram R$ 20.150 de antecipação de parcelas,
 * e as parcelas de compras antigas que ela trouxe para 09/12 não chegam pelo
 * Open Finance.
 */
const fatura = (id: string, fechamento: string, vencimento: string, total: string): any => ({
  id,
  credit_card_id: 'cartao',
  bill_closing_date: `${fechamento}T03:00:00.000000Z`,
  due_date: `${vencimento}T03:00:00.000000Z`,
  bill_total_amount: { amount: total, currency: 'BRL' },
  payments: [],
  created_at: '',
  updated_at: '',
})
const FATURAS = faturasFechadas([
  fatura('dez', '2025-12-09', '2025-12-16', '15893.1600'),
  fatura('nov', '2025-11-09', '2025-11-16', '11413.5700'),
  fatura('jan', '2026-01-09', '2026-01-16', '6554.8200'),
  fatura('jan-de-novo', '2026-01-09', '2026-01-16', '6554.8200'),
])
const INICIO = '2025-11-10'
const linha = (amountCents: number, date: string, billId: string | null = null, billForecastMonth: string | null = null) =>
  ({ amountCents, date, billId, billForecastMonth })

describe('faturasFechadas', () => {
  it('uma por fechamento, em ordem, total negativo', () => {
    expect(FATURAS.map((f) => [f.fechamento, f.totalCents])).toEqual([
      ['2025-11-09', -1141357], ['2025-12-09', -1589316], ['2026-01-09', -655482],
    ])
    expect(FATURAS[2].billIds).toEqual(['jan', 'jan-de-novo'])
  })
})

describe('fechamentoDaLinha', () => {
  it('pelo bill_id, mesmo o repetido', () => {
    expect(fechamentoDaLinha(linha(-100, '2025-11-19', 'jan-de-novo'), FATURAS)).toBe('2026-01-09')
  })

  it('pelo mês do vencimento', () => {
    expect(fechamentoDaLinha(linha(-100, '2025-11-19', null, '2025-12'), FATURAS)).toBe('2025-12-09')
  })

  it('pagamento: o ciclo em que foi feito', () => {
    expect(fechamentoDaLinha(linha(2015000, '2025-11-24'), FATURAS)).toBe('2025-12-09')
  })

  it('fatura aberta não tem fechamento', () => {
    expect(fechamentoDaLinha(linha(-100, '2026-01-20', null, '2026-02'), FATURAS)).toBeNull()
    expect(fechamentoDaLinha(linha(-100, '2026-01-20'), FATURAS)).toBeNull()
  })
})

describe('faltasPorFatura', () => {
  it('o que a fatura cobrou além do que chegou vira falta', () => {
    const linhas = [
      linha(-1879998, '2025-11-20', 'dez'), // compras e a devolução de saldo credor
      linha(2015000, '2025-11-24'), // antecipação: crédito no cartão
      linha(1589316, '2025-12-16'), // pagamento da fatura de dezembro
      linha(-650402, '2025-12-20', 'jan'),
    ]
    const faltas = faltasPorFatura(linhas, FATURAS, INICIO)
    // Primeiro ciclo parte do zero: −15.893,16 − (−18.799,98 + 20.150) = −17.243,18.
    expect(faltas.get('2025-12-09')).toBe(-1724318)
    // −6.554,82 − (−15.893,16) = 9.338,34 esperado; andou 15.893,16 − 6.504,02.
    expect(faltas.get('2026-01-09')).toBe(-5080)
    // A fatura anterior ao início não tem falta: foi quitada fora do app.
    expect(faltas.has('2025-11-09')).toBe(false)
  })

  it('débito a mais no app não vira crédito: zero', () => {
    const faltas = faltasPorFatura([linha(-1600000, '2025-11-20', 'dez')], FATURAS, INICIO)
    expect(faltas.get('2025-12-09')).toBe(0)
  })

  it('sem a fatura anterior ao ciclo, não calcula', () => {
    const semNovembro = FATURAS.slice(1)
    expect(faltasPorFatura([], semNovembro, INICIO).has('2025-12-09')).toBe(false)
  })
})
