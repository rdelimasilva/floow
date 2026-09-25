import { describe, it, expect, vi, afterEach } from 'vitest'
import { instrumentPostgresJsSql } from '@sentry/core'
import { createDb, setSqlWrapper, transactions } from '@floow/db'

/**
 * O Sentry envolve o cliente `postgres` para cada consulta virar span. O
 * registro é feito no `sentry.server.config.ts`, fora do pacote do banco;
 * estes testes prendem que ele chega ao `createDb` e que o Drizzle aceita o
 * cliente envolvido. Nenhum conecta: `postgres()` só abre conexão na primeira
 * consulta.
 */

const URL_FALSA = 'postgres://u:p@localhost:5432/db'

afterEach(() => setSqlWrapper((sql) => sql))

describe('envolver o cliente postgres', () => {
  it('createDb passa o cliente pelo embrulho registrado', () => {
    const embrulho = vi.fn((sql) => sql)
    setSqlWrapper(embrulho)
    createDb(URL_FALSA)
    expect(embrulho).toHaveBeenCalledTimes(1)
  })

  it('o Drizzle monta consulta com o cliente envolvido pelo Sentry', () => {
    setSqlWrapper((sql) => instrumentPostgresJsSql(sql))
    const db = createDb(URL_FALSA)
    const { sql } = db.select({ id: transactions.id }).from(transactions).limit(1).toSQL()
    expect(sql).toContain('from "transactions"')
  })
})
