import { describe, it, expect } from 'vitest'
import { totaisPorFatura } from '../fatura'

/**
 * A fatura pela regra do banco: anterior − pagamentos do ciclo + lançamentos.
 * Números do Master Black (fechamento cadastrado no dia 8, vencimento 15).
 */

const l = (date: string, amountCents: number, extra: object = {}) => ({
  date, amountCents, purchaseDate: null, installmentTotal: null,
  type: 'expense', isIgnored: false, matchedTransactionId: null, ...extra,
})
const pagamento = (date: string, amountCents: number, extra: object = {}) => l(date, amountCents, { type: 'transfer', ...extra })

const julho = { fechamento: '2026-07-09', vencimento: '2026-07-16', totalCents: -1391303 }
const agosto = { fechamento: '2026-08-09', vencimento: '2026-08-17', totalCents: -1100429 }

describe('fatura fechada pelo banco', () => {
  it('vale o total que o banco informa, não a soma dos lançamentos', () => {
    // A lista da Polp de agosto soma R$ 13.904,29; faltam duas cobranças de R$ 50.
    const totais = totaisPorFatura([l('2026-07-20', -1390429)], 8, { dueDay: 15, faturasDoBanco: [agosto] })
    expect(totais.get('2026-08-08')).toBe(-1100429)
  })
})

describe('pagamento antecipado', () => {
  it('o que se pagou além da fatura anterior abate a seguinte', () => {
    // Julho (R$ 13.913,03) pago em 16/07; mais R$ 2.000 em 05/08 e R$ 1.000 em
    // 08/08. Os R$ 3.000 a mais saem da fatura de agosto.
    const totais = totaisPorFatura([
      pagamento('2026-07-16', 1391303),
      pagamento('2026-08-05', 200000),
      pagamento('2026-08-08', 100000),
      l('2026-07-20', -1400429),
    ], 8, { dueDay: 15, faturasDoBanco: [julho] })
    expect(totais.get('2026-08-08')).toBe(-1100429)
  })

  it('fatura aberta já desconta o antecipado', () => {
    // Outubro fechou em R$ 11.988,10 e foi paga com R$ 1.000 a mais.
    const outubro = { fechamento: '2026-10-09', vencimento: '2026-10-16', totalCents: -1198810 }
    const totais = totaisPorFatura([
      pagamento('2026-10-16', 1298810),
      l('2026-10-20', -500000),
    ], 8, { dueDay: 15, faturasDoBanco: [outubro] })
    expect(totais.get('2026-11-08')).toBe(-400000)
  })

  it('fatura anterior ainda não paga não entra na seguinte', () => {
    const outubro = { fechamento: '2026-10-09', vencimento: '2026-10-16', totalCents: -1198810 }
    const totais = totaisPorFatura([l('2026-10-10', -50000)], 8, { dueDay: 15, faturasDoBanco: [outubro] })
    expect(totais.get('2026-11-08')).toBe(-50000)
  })

  it('sem a fatura anterior, o pagamento do ciclo não muda nada', () => {
    const totais = totaisPorFatura([pagamento('2026-07-16', 1391303), l('2026-07-20', -100000)], 8, { dueDay: 15 })
    expect(totais.get('2026-08-08')).toBe(-100000)
  })

  it('ciclo só com pagamento, antes do histórico, não vira fatura anterior', () => {
    // Master Black sem os totais do banco: o débito de 16/06 paga uma fatura
    // cujas compras o app não tem. Não pode virar crédito em julho.
    const totais = totaisPorFatura([
      pagamento('2026-06-16', 1187895),
      pagamento('2026-07-16', 1391303),
      l('2026-07-20', -100000),
    ], 8, { dueDay: 15 })
    expect(totais.get('2026-08-08')).toBe(-100000)
  })

  it('a anterior calculada pelo app também serve', () => {
    // Cartão sem Open Finance: setembro soma R$ 1.000 e foi pago com R$ 1.200.
    const totais = totaisPorFatura([
      l('2026-08-20', -100000),
      pagamento('2026-09-15', 120000),
      l('2026-09-20', -50000),
    ], 8, { dueDay: 15 })
    expect(totais.get('2026-09-08')).toBe(-100000)
    expect(totais.get('2026-10-08')).toBe(-30000)
  })

  it('pagamento ignorado ou previsto não conta', () => {
    const totais = totaisPorFatura([
      pagamento('2026-07-16', 1391303),
      pagamento('2026-08-05', 200000, { isIgnored: true }),
      pagamento('2026-08-06', 200000, { ehPrevisao: true }),
      l('2026-07-20', -100000),
    ], 8, { dueDay: 15, faturasDoBanco: [julho] })
    expect(totais.get('2026-08-08')).toBe(-100000)
  })
})
