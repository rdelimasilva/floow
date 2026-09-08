import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'

/**
 * A precedência do flag, isolada da query que a usa: lançamento manda,
 * categoria é o padrão, e o terceiro argumento cobre lançamento sem
 * categoria — onde o left join devolve NULL nos dois lados e o default tem
 * que ser contar, o comportamento anterior à feature.
 *
 * Sem o terceiro argumento, todo lançamento sem categoria sumiria do
 * orçamento e do CFO em silêncio.
 */
describe('effectiveAffectsCashFlow', () => {
  const texto = new PgDialect().sqlToQuery(effectiveAffectsCashFlow).sql

  it('resolve na ordem lançamento, categoria, true', () => {
    expect(texto).toBe(
      'coalesce("transactions"."affects_cash_flow", "categories"."affects_cash_flow", true)',
    )
  })

  it('não vira parâmetro — o default entra literal na consulta', () => {
    // `true` como placeholder faria o Postgres receber um bind em posição de
    // valor booleano dentro do coalesce, o que muda o plano sem ganho.
    expect(new PgDialect().sqlToQuery(effectiveAffectsCashFlow).params).toEqual([])
  })
})
