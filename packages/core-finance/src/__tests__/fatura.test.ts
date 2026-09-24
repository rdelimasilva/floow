import { describe, it, expect } from 'vitest'
import {
  fechamentoNoMes,
  fechamentosEntre,
  fechamentoDoLancamento,
  vencimentoDaFatura,
  entraNaFatura,
  totaisPorFatura,
} from '../fatura'

describe('fechamentoNoMes', () => {
  it('usa o dia pedido', () => {
    expect(fechamentoNoMes(2026, 10, 5)).toBe('2026-10-05')
  })
  it('dia maior que o mês vira o último dia', () => {
    expect(fechamentoNoMes(2026, 2, 31)).toBe('2026-02-28')
    expect(fechamentoNoMes(2028, 2, 30)).toBe('2028-02-29')
  })
})

describe('fechamentosEntre', () => {
  it('lista os fechamentos no intervalo, inclusive nas pontas', () => {
    expect(fechamentosEntre('2026-09-05', '2026-11-05', 5)).toEqual([
      '2026-09-05', '2026-10-05', '2026-11-05',
    ])
  })
  it('vazio quando nenhum fechamento cai no intervalo', () => {
    expect(fechamentosEntre('2026-09-06', '2026-10-04', 5)).toEqual([])
  })
  it('respeita o último dia do mês', () => {
    expect(fechamentosEntre('2026-01-01', '2026-03-31', 31)).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31',
    ])
  })
})

describe('fechamentoDoLancamento', () => {
  const comum = (date: string) => ({ date, purchaseDate: null, installmentTotal: null })

  it('lançamento comum vai para o primeiro fechamento >= data', () => {
    expect(fechamentoDoLancamento(comum('2026-10-03'), 5)).toBe('2026-10-05')
    expect(fechamentoDoLancamento(comum('2026-10-05'), 5)).toBe('2026-10-05')
    expect(fechamentoDoLancamento(comum('2026-10-06'), 5)).toBe('2026-11-05')
  })

  it('vira o ano', () => {
    expect(fechamentoDoLancamento(comum('2026-12-20'), 5)).toBe('2027-01-05')
  })

  it('parcela do Open Finance, datada no vencimento, vai para o fechamento anterior', () => {
    const parcela = { date: '2026-10-15', purchaseDate: '2026-07-27', installmentTotal: 6 }
    expect(fechamentoDoLancamento(parcela, 5)).toBe('2026-10-05')
  })

  it('parcela com vencimento no mês seguinte ao fechamento', () => {
    const parcela = { date: '2026-11-02', purchaseDate: '2026-07-27', installmentTotal: 6 }
    expect(fechamentoDoLancamento(parcela, 25)).toBe('2026-10-25')
  })

  it('parcela manual (sem data de compra) segue o ciclo comum', () => {
    const parcela = { date: '2026-10-15', purchaseDate: null, installmentTotal: 61 }
    expect(fechamentoDoLancamento(parcela, 5)).toBe('2026-11-05')
  })
})

describe('vencimentoDaFatura', () => {
  it('primeiro dia de vencimento depois do fechamento', () => {
    expect(vencimentoDaFatura('2026-10-05', 15)).toBe('2026-10-15')
    expect(vencimentoDaFatura('2026-10-25', 2)).toBe('2026-11-02')
  })
  it('sem dia de vencimento, sem data', () => {
    expect(vencimentoDaFatura('2026-10-05', null)).toBeNull()
  })
})

describe('entraNaFatura', () => {
  const base = { type: 'expense', isIgnored: false, matchedTransactionId: null }
  it('despesa e estorno entram', () => {
    expect(entraNaFatura(base)).toBe(true)
    expect(entraNaFatura({ ...base, type: 'income' })).toBe(true)
  })
  it('pagamento (transferência), ignorado e previsão conciliada ficam fora', () => {
    expect(entraNaFatura({ ...base, type: 'transfer' })).toBe(false)
    expect(entraNaFatura({ ...base, isIgnored: true })).toBe(false)
    expect(entraNaFatura({ ...base, matchedTransactionId: 'x' })).toBe(false)
  })
})

describe('totaisPorFatura', () => {
  it('soma por fechamento só o que entra', () => {
    const l = (date: string, amountCents: number, extra: object = {}) => ({
      date, amountCents, purchaseDate: null, installmentTotal: null,
      type: 'expense', isIgnored: false, matchedTransactionId: null, ...extra,
    })
    const totais = totaisPorFatura([
      l('2026-09-10', -1000),
      l('2026-10-05', -500),
      l('2026-10-01', 200, { type: 'income' }),
      l('2026-10-02', 3000, { type: 'transfer' }),
      l('2026-10-15', -700, { purchaseDate: '2026-07-27', installmentTotal: 6 }),
      l('2026-10-06', -50),
    ], 5)
    expect(totais.get('2026-10-05')).toBe(-2000)
    expect(totais.get('2026-11-05')).toBe(-50)
  })
})
