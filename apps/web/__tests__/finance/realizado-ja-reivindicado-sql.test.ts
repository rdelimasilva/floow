import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { condicaoDeRealizadoSemVinculo } from '@/lib/finance/forecast-match-db'

/**
 * O filtro de "realizado que nenhuma previsão já reivindicou" (usado na
 * consulta de `realizados` em `criarPropostasDeConciliacao`).
 *
 * Sem ele, o realizado que JÁ é alvo de um vínculo continua na lista de
 * candidatos: os índices da 00047 são parciais em `status = 'pending'`, então
 * a proposta aprovada sai do índice e um segundo previsto pode ser proposto
 * para o mesmo realizado. Templates "Aluguel" R$ 1.200 dia 01 e "Condomínio"
 * R$ 1.200 dia 05, um débito de R$ 1.200 no dia 03: aprovada a proposta
 * (Aluguel, R), o sync seguinte propõe (Condomínio, R). Na fila, "É o mesmo"
 * viola `idx_transactions_matched_unique` da 00042, a action estoura, e a
 * proposta fica presa na fila e no contador do badge para sempre.
 *
 * A subconsulta lê a MESMA tabela da consulta externa, então precisa de alias
 * próprio: sem ele, `transactions.id` dentro dela apontaria para a linha de
 * dentro e o `NOT EXISTS` nunca seria verdadeiro.
 *
 * Os parênteses do `NOT EXISTS` vão escritos no template — `notExists()` do
 * drizzle só os adiciona sozinho quando recebe um query builder. Este branch
 * já teve esse bug (commit b9722aa), e nenhum teste com `db` mockado pega:
 * só a renderização real do SQL, via `PgDialect`.
 */

const dialect = new PgDialect()
const gerado = dialect.sqlToQuery(condicaoDeRealizadoSemVinculo()).sql.toLowerCase()

describe('condição de realizado sem vínculo', () => {
  it('abre parênteses logo depois do not exists', () => {
    expect(gerado).toContain('not exists (select 1 from "transactions"')
  })

  it('procura quem já aponta para este realizado', () => {
    expect(gerado).toContain('"matched_transaction_id" = "transactions"."id"')
  })

  it('usa alias próprio na subconsulta, para correlacionar com a linha de fora', () => {
    expect(gerado).toMatch(/from "transactions" "[a-z_]+"/)
  })
})
