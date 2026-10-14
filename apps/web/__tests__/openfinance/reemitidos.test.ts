import { describe, expect, it } from 'vitest'
import { casarReemitidos } from '@/lib/openfinance/reemitidos'

/**
 * Pagamento de setembro do Master Black no Itaú: a Polp passou a listar
 * "Débito automático Fatura Person Mc Black" (17/09, id novo) no lugar de
 * "SAIDA FATURA PERSON MC BLACK" (16/09, id que sumiu da lista).
 */

const l = (id: string, amountCents: number, date: string) => ({ id, amountCents, date })

describe('casarReemitidos', () => {
  it('o reemitido ocupa a linha antiga do mesmo valor, até 3 dias', () => {
    const pares = casarReemitidos([l('novo', -1168540, '2026-09-17')], [l('saida', -1168540, '2026-09-16')])
    expect([...pares]).toEqual([['novo', 'saida']])
  })

  it('valor diferente ou mais de 3 dias não ocupa', () => {
    expect(casarReemitidos([l('novo', -1168540, '2026-09-17')], [l('a', -1168541, '2026-09-17'), l('b', -1168540, '2026-09-10')]).size).toBe(0)
  })

  it('cada linha antiga serve a um reemitido só', () => {
    const pares = casarReemitidos(
      [l('n1', -5000, '2026-07-11'), l('n2', -5000, '2026-07-11')],
      [l('antiga', -5000, '2026-07-11')],
    )
    expect(pares.size).toBe(1)
  })
})
