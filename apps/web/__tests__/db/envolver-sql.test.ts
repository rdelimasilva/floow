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

  /**
   * Na Vercel a instância congela entre requisições e o pooler derruba a
   * conexão ociosa nesse meio tempo. Sem prazo de ociosidade, a primeira
   * consulta depois do congelamento caía numa conexão morta e esperava
   * segundos para reconectar (visto no Sentry: consulta de 0,3 s levando 4 s).
   */
  it('o cliente fecha conexão ociosa, renova a antiga e desiste rápido de conectar', () => {
    let opcoes: Record<string, unknown> = {}
    setSqlWrapper((sql) => {
      opcoes = sql.options as unknown as Record<string, unknown>
      return sql
    })
    createDb(URL_FALSA)
    expect(opcoes.prepare).toBe(false)
    expect(opcoes.idle_timeout).toBe(10)
    expect(opcoes.max_lifetime).toBe(60 * 10)
    expect(opcoes.connect_timeout).toBe(5)
  })

  it('o Drizzle monta consulta com o cliente envolvido pelo Sentry', () => {
    setSqlWrapper((sql) => instrumentPostgresJsSql(sql))
    const db = createDb(URL_FALSA)
    const { sql } = db.select({ id: transactions.id }).from(transactions).limit(1).toSQL()
    expect(sql).toContain('from "transactions"')
  })
})
