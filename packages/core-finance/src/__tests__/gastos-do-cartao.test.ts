import { describe, it, expect } from 'vitest'
import { gastosPorFatura, SEM_CATEGORIA, type LancamentoComCategoria } from '../gastos-do-cartao'

const l = (date: string, amountCents: number, extra: Partial<LancamentoComCategoria> = {}): LancamentoComCategoria => ({
  date, amountCents, type: amountCents < 0 ? 'expense' : 'income', isIgnored: false, matchedTransactionId: null,
  purchaseDate: null, installmentTotal: null, categoryName: 'Mercado', ...extra,
})

describe('gastosPorFatura', () => {
  it('soma compras menos estornos por fatura e categoria, fora o pagamento', () => {
    const r = gastosPorFatura([
      l('2026-09-03', -10000),
      l('2026-09-04', -5000, { categoryName: null }),
      l('2026-09-04', 2000),
      l('2026-09-10', -7000),
      l('2026-09-10', 50000, { type: 'transfer' }),
    ], 5, 12, null)
    expect(r.map((g) => [g.fechamento, g.totalCents])).toEqual([['2026-09-05', 13000], ['2026-10-05', 7000]])
    expect(r[0].porCategoria.get('Mercado')).toBe(8000)
    expect(r[0].porCategoria.get(SEM_CATEGORIA)).toBe(5000)
    expect(r[0].lancamentos).toHaveLength(3)
  })

  it('bill_id leva a compra da virada para a fatura da maioria', () => {
    const r = gastosPorFatura([
      l('2026-09-02', -1000, { billId: 'b1' }),
      l('2026-09-03', -1000, { billId: 'b1' }),
      l('2026-09-06', -1000, { billId: 'b1' }),
    ], 5, 12, null)
    expect(r).toHaveLength(1)
    expect(r[0].totalCents).toBe(3000)
  })
})
