import { describe, expect, it } from 'vitest'
import { agruparParceladosNoCartao, type ParcelaDoCartao } from '../../openfinance/parcelados-no-cartao'

function parcela(n: number, total: number, date: string, over: Partial<ParcelaDoCartao> = {}): ParcelaDoCartao {
  return {
    accountId: 'cartao-1',
    accountName: 'Master Black',
    compra: '2026-09-01',
    installmentNumber: n,
    installmentTotal: total,
    amountCents: 10000,
    date,
    description: `Loja ${String(n).padStart(2, '0')}/${String(total).padStart(2, '0')}`,
    ...over,
  }
}

const HOJE = '2026-10-19'

describe('agruparParceladosNoCartao', () => {
  it('junta as parcelas da compra e separa o pago do que falta', () => {
    const [p] = agruparParceladosNoCartao(
      [
        parcela(1, 4, '2026-09-15'),
        parcela(2, 4, '2026-10-15'),
        parcela(3, 4, '2026-11-15'),
        parcela(4, 4, '2026-12-15'),
      ],
      HOJE,
    )
    expect(p).toMatchObject({
      description: 'Loja',
      accountName: 'Master Black',
      installmentTotal: 4,
      paidCount: 2,
      totalCents: 40000,
      paidCents: 20000,
      remainingCents: 20000,
      installmentCents: 10000,
      nextDueDate: '2026-11-15',
    })
  })

  it('compra quitada não aparece', () => {
    expect(agruparParceladosNoCartao([parcela(1, 2, '2026-09-15'), parcela(2, 2, '2026-10-15')], HOJE)).toEqual([])
  })

  it('parcela que vence hoje já conta como paga', () => {
    const [p] = agruparParceladosNoCartao([parcela(1, 2, HOJE), parcela(2, 2, '2026-11-19')], HOJE)
    expect(p.paidCount).toBe(1)
  })

  it('parcela antiga que o banco não mandou conta como paga, pelo valor da parcela', () => {
    // Janela de 12 meses do Open Finance: a 1/10 de uma compra antiga nunca chega.
    // Chegaram da 2 à 10; só a 10 vence depois de hoje.
    const conhecidas = Array.from({ length: 9 }, (_, i) => parcela(i + 2, 10, i < 8 ? '2026-09-15' : '2026-11-15'))
    const [p] = agruparParceladosNoCartao(conhecidas, HOJE)
    expect(p).toMatchObject({ paidCount: 9, totalCents: 100000, paidCents: 90000, remainingCents: 10000 })
  })

  it('mesma loja, mesma data de compra, valores diferentes: duas compras', () => {
    const r = agruparParceladosNoCartao(
      [
        parcela(1, 2, '2026-10-15'),
        parcela(2, 2, '2026-11-15'),
        parcela(1, 2, '2026-10-15', { amountCents: 3202 }),
        parcela(2, 2, '2026-11-15', { amountCents: 3202 }),
      ],
      HOJE,
    )
    expect(r.map((p) => p.remainingCents).sort()).toEqual([10000, 3202])
  })

  it('a primeira parcela com os centavos do arredondamento fica na mesma compra', () => {
    const r = agruparParceladosNoCartao(
      [parcela(1, 3, '2026-10-15', { amountCents: 10004 }), parcela(2, 3, '2026-11-15'), parcela(3, 3, '2026-12-15')],
      HOJE,
    )
    expect(r).toHaveLength(1)
    expect(r[0].totalCents).toBe(30004)
  })

  it('cartões diferentes não se misturam', () => {
    const r = agruparParceladosNoCartao(
      [parcela(1, 2, '2026-11-15'), parcela(1, 2, '2026-11-15', { accountId: 'cartao-2', accountName: 'Visa' })],
      HOJE,
    )
    expect(r).toHaveLength(2)
  })

  it('número repetido (real e previsão) conta uma vez só', () => {
    const [p] = agruparParceladosNoCartao([parcela(1, 2, '2026-10-15'), parcela(2, 2, '2026-11-15'), parcela(2, 2, '2026-11-15')], HOJE)
    expect(p.remainingCents).toBe(10000)
    expect(p.totalCents).toBe(20000)
  })

  it('tira o "(1/12)" da descrição da parcela manual', () => {
    const [p] = agruparParceladosNoCartao(
      [parcela(1, 2, '2026-11-15', { compra: 'recorrencia-1', description: 'Livelo - Compra Milhas (1/2)' })],
      HOJE,
    )
    expect(p.description).toBe('Livelo - Compra Milhas')
  })

  it('ordena pelo próximo vencimento', () => {
    const r = agruparParceladosNoCartao(
      [parcela(1, 2, '2026-12-15', { compra: 'b', description: 'B' }), parcela(1, 2, '2026-11-15', { compra: 'a', description: 'A' })],
      HOJE,
    )
    expect(r.map((p) => p.description)).toEqual(['A', 'B'])
  })
})
