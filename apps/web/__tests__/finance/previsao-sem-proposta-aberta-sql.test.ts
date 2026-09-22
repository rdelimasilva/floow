import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { condicaoDePrevisaoSemPropostaAberta } from '@/lib/finance/forecast-match-db'

/**
 * O filtro de "previsão sem proposta pendente aberta" (usado em
 * `criarPropostasDeConciliacao`) é montado com SQL cru, e não com
 * `notExists(db.select(...))` — ver o comentário de
 * `condicaoDePrevisaoSemPropostaAberta` em `forecast-match-db.ts`.
 *
 * `NOT EXISTS` exige a subconsulta entre parênteses, e `notExists()` do
 * drizzle só os adiciona sozinho quando recebe um query builder — um
 * fragmento `sql` cru ele injeta como veio. Sem os parênteses o Postgres
 * recusa a consulta inteira, e todo sync estouraria no primeiro lote real.
 *
 * Nenhum teste com `db` mockado pega isso: o mock nunca olha para a sintaxe
 * do SQL, só para a sequência de chamadas encadeadas. Só a renderização real
 * do SQL, via `PgDialect`, pega um `not exists select` sem parênteses. Este
 * teste existe para isso — trava a sintaxe renderizada.
 */

const dialect = new PgDialect()
const sqlGerado = dialect.sqlToQuery(condicaoDePrevisaoSemPropostaAberta()).sql.toLowerCase()

describe('condição de previsão sem proposta aberta', () => {
  it('abre parênteses logo depois do not exists', () => {
    expect(sqlGerado).toContain('not exists (select 1 from "forecast_match_proposals"')
  })

  it('compara a previsão pelo id da transação e pelo status pendente', () => {
    expect(sqlGerado).toContain('"forecast_transaction_id"')
    expect(sqlGerado).toContain("'pending'")
  })
})
