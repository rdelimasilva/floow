import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { auditarConciliacao } from '@/lib/finance/conciliacao/auditoria'

/**
 * Pares que movem saldo e o invariante só em conta conciliável (recurso
 * vivo `ACCOUNT`, Ruling P12); a divergência de saldo continua em toda conta
 * Open Finance com saldo do banco.
 */
const dialect = new PgDialect()

async function consultas() {
  const executadas: { sql: string; params: unknown[] }[] = []
  const db: any = { execute: async (q: SQL) => { executadas.push(dialect.sqlToQuery(q)); return [] } }
  await auditarConciliacao(db)
  return executadas
}

describe('auditarConciliacao — escopo', () => {
  it('pares que movem saldo: só conta conciliável', async () => {
    const [pares] = await consultas()
    expect(pares.sql).toContain('r.resource_type = $')
    expect(pares.params).toContain('ACCOUNT')
  })

  it('divergência de saldo: toda conta Open Finance com saldo do banco, sem filtrar tipo', async () => {
    const [, saldos] = await consultas()
    expect(saldos.sql).not.toContain('resource_type')
  })

  it('invariante: só conta conciliável', async () => {
    const [, , invariante] = await consultas()
    expect(invariante.sql).toContain('r.resource_type = $')
    expect(invariante.params).toContain('ACCOUNT')
  })
})
