import { describe, it, expect } from 'vitest'
import { intercalarFaturas, intervaloDaPagina, fechamentosDoIntervalo, type FaturaNoExtrato } from '@/lib/finance/intercalar-faturas'

const tx = (id: string, date: string) => ({ id, date: `${date}T00:00:00.000Z` })
const fatura = (fechamento: string, accountName = 'Cartão'): FaturaNoExtrato => ({
  accountId: 'c1', accountName, fechamento, vencimento: null, totalCents: -100,
})

describe('intercalarFaturas', () => {
  it('em ordem crescente, a fatura vem depois dos lançamentos do dia do fechamento', () => {
    const itens = intercalarFaturas(
      [tx('a', '2026-10-04'), tx('b', '2026-10-05'), tx('c', '2026-10-06')],
      [fatura('2026-10-05')],
      'asc',
    )
    expect(itens.map((i) => (i.kind === 'tx' ? i.tx.id : `F${i.fatura.fechamento}`)))
      .toEqual(['a', 'b', 'F2026-10-05', 'c'])
  })

  it('em ordem decrescente, a fatura vem antes dos lançamentos do dia do fechamento', () => {
    const itens = intercalarFaturas(
      [tx('c', '2026-10-06'), tx('b', '2026-10-05'), tx('a', '2026-10-04')],
      [fatura('2026-10-05')],
      'desc',
    )
    expect(itens.map((i) => (i.kind === 'tx' ? i.tx.id : `F${i.fatura.fechamento}`)))
      .toEqual(['c', 'F2026-10-05', 'b', 'a'])
  })

  it('fatura depois do último lançamento vai para o fim (crescente)', () => {
    const itens = intercalarFaturas([tx('a', '2026-09-20')], [fatura('2026-10-05')], 'asc')
    expect(itens.map((i) => i.kind)).toEqual(['tx', 'fatura'])
  })

  it('guarda o índice original do lançamento, que a coluna de saldo usa', () => {
    const itens = intercalarFaturas([tx('a', '2026-10-04'), tx('b', '2026-10-06')], [fatura('2026-10-05')], 'asc')
    const ultimo = itens[2]
    expect(ultimo.kind === 'tx' && ultimo.idx).toBe(1)
  })
})

describe('intervaloDaPagina', () => {
  const datas = ['2026-09-10T00:00:00.000Z', '2026-10-20T00:00:00.000Z']

  it('vai da primeira à última data da página', () => {
    expect(intervaloDaPagina(datas, { ultimaCronologica: false }))
      .toEqual({ inicio: '2026-09-10', fim: '2026-10-20', limite: null, incluirProximo: false })
  })

  it('na página mais recente pede também o próximo fechamento (fatura em aberto)', () => {
    expect(intervaloDaPagina(datas, { ultimaCronologica: true }))
      .toEqual({ inicio: '2026-09-10', fim: '2026-10-20', limite: null, incluirProximo: true })
  })

  it('respeita o período do filtro', () => {
    expect(intervaloDaPagina(datas, { ultimaCronologica: true, startDate: '2026-09-15', endDate: '2026-10-31' }))
      .toEqual({ inicio: '2026-09-15', fim: '2026-10-20', limite: '2026-10-31', incluirProximo: true })
  })

  it('página vazia não tem intervalo', () => {
    expect(intervaloDaPagina([], { ultimaCronologica: true })).toBeNull()
  })
})

describe('fechamentosDoIntervalo', () => {
  it('inclui o próximo fechamento depois do fim quando pedido', () => {
    expect(fechamentosDoIntervalo({ inicio: '2026-09-10', fim: '2026-10-20', limite: null, incluirProximo: true }, 5))
      .toEqual(['2026-10-05', '2026-11-05'])
  })

  it('o próximo não passa do limite do filtro', () => {
    expect(fechamentosDoIntervalo({ inicio: '2026-09-10', fim: '2026-10-20', limite: '2026-10-31', incluirProximo: true }, 5))
      .toEqual(['2026-10-05'])
  })

  it('sem pedir o próximo, só o que cai entre as pontas', () => {
    expect(fechamentosDoIntervalo({ inicio: '2026-09-10', fim: '2026-10-20', limite: null, incluirProximo: false }, 5))
      .toEqual(['2026-10-05'])
  })
})
