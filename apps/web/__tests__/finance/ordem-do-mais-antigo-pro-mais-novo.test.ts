import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { buildTransactionOrder } from '@/lib/finance/queries'
import { paginaQueAbre } from '@/lib/finance/pagination'

/**
 * A listagem corre como extrato: do mais antigo para o mais novo.
 *
 * O padrão era `desc`, e o saldo corrido lido de cima para baixo andava para
 * trás — cada linha mostrava o saldo ANTES da linha de cima. Em `asc` a coluna
 * acumula na mesma direção em que se lê.
 *
 * Só que `asc` na página 1 abre em 2019, e ninguém entra em transações para
 * ver 2019: abre na ÚLTIMA página, onde está a data mais recente e o saldo de
 * hoje na última linha. Página pedida na URL manda — paginar para trás
 * continua funcionando — e ordenação por outra coluna (valor, descrição) volta
 * para a página 1, porque aí "última página" não quer dizer nada.
 */

const dialect = new PgDialect()
const ordemDe = (opts?: Parameters<typeof buildTransactionOrder>[0]) =>
  buildTransactionOrder(opts)
    .map((o) => dialect.sqlToQuery(o).sql.toLowerCase())
    .join(' , ')

describe('direção padrão da ordenação', () => {
  it('sem opção, do mais antigo pro mais novo', () => {
    const gerado = ordemDe()
    expect(gerado).toContain('"date" asc')
    expect(gerado).not.toContain('desc')
  })

  it('o desempate por id segue a direção da data', () => {
    expect(ordemDe()).toContain('"id" asc')
    expect(ordemDe({ sortDir: 'desc' })).toContain('"id" desc')
  })

  it('desc explícito continua respeitado', () => {
    expect(ordemDe({ sortDir: 'desc' })).toContain('"date" desc')
  })
})

describe('página em que a listagem abre', () => {
  const cronologico = { totalCount: 95, pageSize: 30, sortBy: 'date', sortDir: 'asc' }

  it('sem page na URL, abre na última — onde está a data mais recente', () => {
    expect(paginaQueAbre(cronologico)).toBe(4)
  })

  it('a última página é exata quando o total fecha na conta', () => {
    expect(paginaQueAbre({ ...cronologico, totalCount: 90 })).toBe(3)
  })

  it('lista vazia ainda é a página 1', () => {
    expect(paginaQueAbre({ ...cronologico, totalCount: 0 })).toBe(1)
  })

  it('page na URL manda, inclusive para trás', () => {
    expect(paginaQueAbre({ ...cronologico, pageParam: '2' })).toBe(2)
  })

  it('page inválido não vira NaN nem zero', () => {
    expect(paginaQueAbre({ ...cronologico, pageParam: 'abc' })).toBe(4)
    expect(paginaQueAbre({ ...cronologico, pageParam: '0' })).toBe(1)
  })

  it('ordenado por outra coluna, abre na primeira', () => {
    expect(paginaQueAbre({ ...cronologico, sortBy: 'amountCents' })).toBe(1)
  })

  it('em ordem decrescente, o mais recente já está na primeira', () => {
    expect(paginaQueAbre({ ...cronologico, sortDir: 'desc' })).toBe(1)
  })
})
