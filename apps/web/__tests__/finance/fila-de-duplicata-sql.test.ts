import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { alias } from 'drizzle-orm/pg-core'
import { transactions } from '@floow/db'
import { condicaoDeDuplicataAberta } from '@/lib/finance/duplicata-queries'

/**
 * A fila so pode listar o que ainda da para decidir.
 *
 * A janela entre propor e aprovar e aberta por desenho — a fila nao bloqueia o
 * app — e nela o usuario mexe nos dois lados. Se a duplicata ja foi marcada
 * como ignorada por outro caminho, `toggleIgnoreTransaction` ja estornou o
 * saldo, e aprovar em seguida estornaria de novo: o lancamento sairia do saldo
 * duas vezes.
 *
 * Prende o SQL porque o filtro roda no Postgres — o valor de retorno nao
 * revela quais linhas a consulta considerou. Mesmo desenho de
 * `fila-so-lista-proposta-valida.test.ts`.
 */
const dialect = new PgDialect()

function sqlDe(cond: unknown): string {
  return dialect.sqlToQuery(cond as never).sql.toLowerCase()
}

describe('condicaoDeDuplicataAberta', () => {
  const duplicata = alias(transactions, 'duplicata')

  it('só considera proposta pendente', () => {
    const sql = sqlDe(condicaoDeDuplicataAberta('org-1', duplicata))

    expect(sql).toContain('"status" =')
  })

  it('exige a org, porque a conexão do app ignora RLS', () => {
    const sql = sqlDe(condicaoDeDuplicataAberta('org-1', duplicata))

    expect(sql).toContain('"org_id" =')
  })

  it('tira da fila a duplicata que já foi ignorada por outro caminho', () => {
    const sql = sqlDe(condicaoDeDuplicataAberta('org-1', duplicata))

    expect(sql).toContain('"duplicata"."is_ignored" =')
  })
})
