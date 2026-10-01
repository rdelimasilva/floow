import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { PgDialect } from 'drizzle-orm/pg-core'
import { and } from 'drizzle-orm'
import { buildTransactionConditions, consultaDaPagina } from '@/lib/finance/queries-transactions'

/**
 * A previsão já conciliada some da listagem: quem a cumpriu é o realizado do
 * Open Finance, e mostrar as duas linhas polui o extrato com o mesmo
 * lançamento duas vezes. Ver `buildTransactionConditions` em
 * `queries-transactions.ts`.
 *
 * A condição entra no WHERE compartilhado — por isso a página, a contagem
 * (`getTransactionCount`) e o total embutido (`consultaDaPagina`, via
 * `count(*) over ()`) concordam sozinhos, sem precisar repetir o filtro em
 * três lugares.
 */

const dialect = new PgDialect()
const sqlDe = (opts?: Parameters<typeof buildTransactionConditions>[1]) =>
  dialect.sqlToQuery(and(...buildTransactionConditions('org-1', opts))!).sql.toLowerCase()

describe('previsão conciliada some da lista de lançamentos', () => {
  it('o WHERE da listagem exige matched_transaction_id nulo', () => {
    expect(sqlDe()).toContain('"matched_transaction_id" is null')
  })

  it('o filtro vale com qualquer outra combinação de opções', () => {
    expect(sqlDe({ includeFuture: true, search: 'luz', accountId: 'conta-1' }))
      .toContain('"matched_transaction_id" is null')
  })

  it('a consulta da página carrega o mesmo filtro — página e total não divergem', () => {
    const db = drizzle.mock()
    const gerado = consultaDaPagina(db, 'org-1', { limit: 50, offset: 0 }).toSQL().sql.toLowerCase()
    // A condição vive dentro da subconsulta "pagina", que também gera o
    // `count(*) over ()` do total — não dá pra um concordar e o outro não.
    const fimDaPagina = gerado.indexOf(') "pagina"')
    expect(fimDaPagina).toBeGreaterThan(-1)
    expect(gerado.slice(0, fimDaPagina)).toContain('matched_transaction_id')
  })
})
