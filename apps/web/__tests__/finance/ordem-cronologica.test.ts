import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { buildTransactionOrder } from '@/lib/finance/queries'

/**
 * A listagem e uma linha do tempo. So isso.
 *
 * A ordenacao punha `balance_applied DESC` ANTES da data: todo lancamento
 * realizado vinha primeiro, e so depois as previsoes — nao importa de quando
 * fossem. Com 892 linhas realizadas, ligar o filtro "previsoes" jogava as 263
 * futuras para a pagina 30. O filtro parecia nao fazer nada.
 *
 * Veio do commit d8fcdd5 ("sort applied transactions first"), de quando
 * previsao nao tinha selo e so se distinguia pela posicao. Hoje ela tem selo
 * proprio — `previsto`, `nao conciliado`, `conciliado` — e nao precisa mais
 * ser exilada para o fim.
 *
 * O desempate por `id` tambem segue a direcao do sort. Ele existe porque
 * nenhuma coluna ordenavel e unica (um extrato tem dezessete lancamentos no
 * mesmo dia) e sem ele o Postgres devolve a ordem que quiser. E acompanha a
 * direcao para a ordem EXIBIDA bater com a ordem em que o saldo ACUMULA, que
 * e (data, id) crescente: com `id` sempre crescente numa lista decrescente,
 * as linhas do mesmo dia correriam ao contrario do resto e a coluna pareceria
 * saltar a cada virada de dia.
 */

const dialect = new PgDialect()
const ordem = (opts?: Parameters<typeof buildTransactionOrder>[0]) =>
  dialect.sqlToQuery(sql.join([...buildTransactionOrder(opts)], sql`, `)).sql.toLowerCase()

describe('ordenacao da listagem', () => {
  it('nao separa realizado de previsto — e uma linha do tempo so', () => {
    expect(ordem()).not.toContain('balance_applied')
  })

  it('ordena por data, com id desempatando na mesma direcao (desc)', () => {
    const gerado = ordem({ sortBy: 'date', sortDir: 'desc' })
    expect(gerado).toBe('"transactions"."date" desc, "transactions"."id" desc')
  })

  it('e na mesma direcao quando crescente (asc)', () => {
    const gerado = ordem({ sortBy: 'date', sortDir: 'asc' })
    expect(gerado).toBe('"transactions"."date" asc, "transactions"."id" asc')
  })
})
