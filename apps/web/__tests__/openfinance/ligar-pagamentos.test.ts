import { describe, expect, it } from 'vitest'
import { casarPagamentos } from '@/lib/openfinance/ligar-pagamentos'

/**
 * Visa PDA: o banco lista os pagamentos da fatura; o Itaú tem as saídas
 * ("Débito automático ITAU VISA PAO DE AC"); o cartão não tinha nada.
 */

const m = (id: string, amountCents: number, date: string) => ({ id, amountCents, date })
const pg = (amountCents: number, date: string) => ({ amountCents, date })

describe('casarPagamentos', () => {
  it('a saída do mesmo valor ganha a perna no cartão', () => {
    const ligar = casarPagamentos([pg(76388, '2026-09-15')], [], [m('itau', -76388, '2026-09-15')])
    expect(ligar.map((s) => s.id)).toEqual(['itau'])
  })

  it('pagamento que o extrato do cartão já trouxe não ganha perna', () => {
    // Master Black, 16/09: "PAGAMENTO DEBITO AUTOMATICO" já está no cartão.
    const ligar = casarPagamentos([pg(1168540, '2026-09-16')], [m('cartao', 1168540, '2026-09-16')], [m('itau', -1168540, '2026-09-16')])
    expect(ligar).toEqual([])
  })

  it('até 3 dias de distância; a mais próxima ganha', () => {
    const ligar = casarPagamentos(
      [pg(50000, '2026-08-10')],
      [],
      [m('longe', -50000, '2026-08-07'), m('perto', -50000, '2026-08-11'), m('fora', -50000, '2026-08-20')],
    )
    expect(ligar.map((s) => s.id)).toEqual(['perto'])
  })

  it('dois pagamentos iguais no mesmo dia usam duas saídas', () => {
    // Visa, 01/02: duas vezes R$ 1.998,92.
    const ligar = casarPagamentos(
      [pg(199892, '2026-02-01'), pg(199892, '2026-02-01')],
      [],
      [m('a', -199892, '2026-02-01'), m('b', -199892, '2026-02-01')],
    )
    expect(ligar.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('cada crédito do cartão cobre um pagamento só', () => {
    const ligar = casarPagamentos(
      [pg(199892, '2026-02-01'), pg(199892, '2026-02-01')],
      [m('ja', 199892, '2026-02-01')],
      [m('a', -199892, '2026-02-01'), m('b', -199892, '2026-02-01')],
    )
    expect(ligar).toHaveLength(1)
  })

  it('sem saída correspondente, nada é criado', () => {
    expect(casarPagamentos([pg(12345, '2026-05-15')], [], [m('outra', -54321, '2026-05-15')])).toEqual([])
  })
})
