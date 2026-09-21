import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  condicaoDePropostaPendenteDaOrg,
  condicaoDaTransacaoDaOrg,
} from '@/lib/finance/forecast-match-db'

/**
 * `aprovarProposta` e `recusarProposta` rodam sob `getDb()`, que conecta como
 * dono das tabelas e IGNORA as policies de RLS (ver o docblock de
 * `withUserDb` em `lib/db/rls.ts`). Nessas duas actions, o `WHERE org_id` é a
 * única barreira entre organizações: sem ele, um id de proposta de outra org
 * — e ids vazam em log, print, URL — efetivaria uma conciliação alheia,
 * gravando `matched_transaction_id` numa previsão que não é da org de quem
 * clicou.
 *
 * Os testes de action usam um mock de query-builder que DESCARTA os
 * argumentos de `.where()`, então nenhum deles provaria o filtro: eles
 * passariam igual com o `eq(orgId)` removido. Por isso as condições são
 * funções exportadas, renderizadas aqui com `PgDialect` — o mesmo recurso de
 * `previsao-sem-proposta-aberta-sql.test.ts`.
 */

const dialect = new PgDialect()

/** `and()` é tipado como `SQL | undefined`; com argumentos fixos nunca é. */
const renderiza = (condicao: ReturnType<typeof condicaoDaTransacaoDaOrg>) =>
  dialect.sqlToQuery(condicao!)

describe('escopo de org nas actions de conciliação', () => {
  it('a proposta é procurada dentro da org, pendente e por id', () => {
    const consulta = renderiza(condicaoDePropostaPendenteDaOrg('prop-1', 'org-1'))
    const gerado = consulta.sql.toLowerCase()

    expect(gerado).toContain('"forecast_match_proposals"."org_id" =')
    expect(gerado).toContain('"forecast_match_proposals"."id" =')
    expect(gerado).toContain('"forecast_match_proposals"."status" =')
    expect(consulta.params).toContain('org-1')
    expect(consulta.params).toContain('prop-1')
    expect(consulta.params).toContain('pending')
  })

  it('o vínculo é gravado dentro da org', () => {
    const consulta = renderiza(condicaoDaTransacaoDaOrg('prev-1', 'org-1'))
    const gerado = consulta.sql.toLowerCase()

    expect(gerado).toContain('"transactions"."org_id" =')
    expect(gerado).toContain('"transactions"."id" =')
    expect(consulta.params).toContain('org-1')
    expect(consulta.params).toContain('prev-1')
  })
})
