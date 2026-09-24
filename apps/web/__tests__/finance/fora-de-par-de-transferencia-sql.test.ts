import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { condicaoForaDeParDeTransferenciaPendente } from '@/lib/finance/forecast-match-db'

describe('condicaoForaDeParDeTransferenciaPendente', () => {
  it('exclui o realizado com proposta pendente contra perna prevista', () => {
    const q = new PgDialect().sqlToQuery(condicaoForaDeParDeTransferenciaPendente())
    const s = q.sql.toLowerCase()
    expect(s).toContain('not exists')
    expect(s).toContain('"forecast_match_proposals"')
    expect(s).toContain("fmp.status = 'pending'")
    expect(s).toContain('fmp.realized_transaction_id = "transactions"."id"')
    expect(q.params).toContain('%:transfer-par')
  })
})
