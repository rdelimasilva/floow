import { describe, it, expect } from 'vitest'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { eq, sql } from 'drizzle-orm'
import { transactions, accounts } from '@floow/db'
import { ehGastoFixo, previstoDaRecorrencia, condicaoDoPrevisto, montarAVencer } from '@/lib/finance/gasto-fixo'

describe('ehGastoFixo', () => {
  it('marca o gerado por recorrência ou o realizado que uma previsão reivindicou, sem subconsulta no GROUP BY', () => {
    const { sql: texto } = new QueryBuilder()
      .select({ cents: sql<number>`SUM(-${transactions.amountCents})`, fixed: ehGastoFixo.as('fixed') })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(previstoDaRecorrencia, condicaoDoPrevisto)
      .groupBy(transactions.date, ehGastoFixo)
      .toSQL()

    expect(texto).toContain('left join "transactions" "previsto_da_recorrencia"')
    expect(texto).toContain('"previsto_da_recorrencia"."matched_transaction_id" = "transactions"."id"')
    expect(texto).toContain('"previsto_da_recorrencia"."recurring_template_id" is not null')
    expect(texto).toMatch(/group by .*"transactions"\."recurring_template_id" IS NOT NULL OR "previsto_da_recorrencia"\."id" IS NOT NULL/)
    expect(texto).not.toMatch(/EXISTS/i)
  })
})

describe('montarAVencer', () => {
  const parentIndex = new Map<string, string | null>([
    ['moradia', null],
    ['aluguel', 'moradia'],
    ['alimentacao', null],
    ['mercado', 'alimentacao'],
    ['lazer', null],
  ])

  it('junta parcelas e recorrências na categoria que tem o teto', () => {
    const r = montarAVencer(
      { mercado: { totalCents: 40_000, parcelas: [] } },
      { aluguel: 880_000, lazer: 5_000 },
      parentIndex,
      new Set(['moradia', 'alimentacao']),
    )
    expect(r).toEqual([
      { categoryId: 'alimentacao', cents: 40_000 },
      { categoryId: 'moradia', cents: 880_000 },
      { categoryId: 'lazer', cents: 5_000 },
    ])
  })
})
