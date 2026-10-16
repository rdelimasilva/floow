import { describe, expect, it } from 'vitest'
import { casarPagamentos } from '@/lib/openfinance/ligar-pagamentos'

/**
 * Visa PDA: o banco lista os pagamentos da fatura; o Itaú tem as saídas
 * ("Débito automático ITAU VISA PAO DE AC"); o cartão não tinha nada.
 */

const m = (id: string, amountCents: number, date: string, aguardando = false) => ({ id, amountCents, date, aguardando })
const pg = (amountCents: number, date: string) => ({ amountCents, date })

describe('casarPagamentos', () => {
  it('a saída do mesmo valor ganha a perna no cartão', () => {
    const { ligar } = casarPagamentos([pg(76388, '2026-09-15')], [], [m('itau', -76388, '2026-09-15')])
    expect(ligar.map((s) => s.id)).toEqual(['itau'])
  })

  it('pagamento que o extrato do cartão já trouxe não ganha perna', () => {
    // Master Black, 16/09: "PAGAMENTO DEBITO AUTOMATICO" já está no cartão.
    const { ligar } = casarPagamentos([pg(1168540, '2026-09-16')], [m('cartao', 1168540, '2026-09-16')], [m('itau', -1168540, '2026-09-16')])
    expect(ligar).toEqual([])
  })

  it('até 3 dias de distância; a mais próxima ganha', () => {
    const { ligar } = casarPagamentos(
      [pg(50000, '2026-08-10')],
      [],
      [m('longe', -50000, '2026-08-07'), m('perto', -50000, '2026-08-11'), m('fora', -50000, '2026-08-20')],
    )
    expect(ligar.map((s) => s.id)).toEqual(['perto'])
  })

  it('dois pagamentos iguais no mesmo dia usam duas saídas', () => {
    // Visa, 01/02: duas vezes R$ 1.998,92.
    const { ligar } = casarPagamentos(
      [pg(199892, '2026-02-01'), pg(199892, '2026-02-01')],
      [],
      [m('a', -199892, '2026-02-01'), m('b', -199892, '2026-02-01')],
    )
    expect(ligar.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('cada crédito do cartão cobre um pagamento só', () => {
    const { ligar } = casarPagamentos(
      [pg(199892, '2026-02-01'), pg(199892, '2026-02-01')],
      [m('ja', 199892, '2026-02-01')],
      [m('a', -199892, '2026-02-01'), m('b', -199892, '2026-02-01')],
    )
    expect(ligar).toHaveLength(1)
  })

  it('sem saída correspondente, nada é criado', () => {
    expect(casarPagamentos([pg(12345, '2026-05-15')], [], [m('outra', -54321, '2026-05-15')])).toEqual({ ligar: [], efetivar: [] })
  })

  // Visa, 16/10: a regra "Débito automático ITAU VISA PAO DE AC" já criou no
  // cartão a perna que aguarda o extrato, e o extrato do Visa nunca traz
  // pagamento. Antes a perna contava como "já está" e ficava fora do saldo
  // para sempre.
  it('perna aguardando o extrato: o banco listou o pagamento, ela entra no saldo', () => {
    const r = casarPagamentos([pg(150930, '2026-10-16')], [m('perna', 150930, '2026-10-16', true)], [])
    expect(r.efetivar.map((c) => c.id)).toEqual(['perna'])
    expect(r.ligar).toEqual([])
  })

  it('o crédito que o extrato trouxe vale antes da perna aguardando', () => {
    // Master Black: o extrato traz o pagamento; a perna é absorvida por ele.
    const r = casarPagamentos(
      [pg(1198810, '2026-10-16')],
      [m('perna', 1198810, '2026-10-16', true), m('extrato', 1198810, '2026-10-16')],
      [],
    )
    expect(r.efetivar).toEqual([])
    expect(r.ligar).toEqual([])
  })
})
