import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { contaOcupada } from '@/lib/openfinance/conta-ocupada'

/**
 * Uma conta do floow espelha UM recurso — de conexão viva. Conexão encerrada
 * não importa mais nada, então o vínculo antigo dela não prende a conta.
 */
function dbFalso(linhas: unknown[][]) {
  const consultas: Array<{ sql: string; params: unknown[] }> = []
  const db = drizzle(async (sql, params) => {
    consultas.push({ sql: sql.toLowerCase(), params })
    return { rows: linhas }
  })
  return { db: db as never, consultas }
}

describe('contaOcupada', () => {
  it('só conta recurso de conexão não revogada, da mesma org', async () => {
    const { db, consultas } = dbFalso([['r1']])
    expect(await contaOcupada(db, 'org-a', 'acc-1')).toBe(true)
    const [q] = consultas
    expect(q.sql).toContain('inner join "openfinance_connections"')
    expect(q.sql).toContain('"openfinance_connections"."revoked_at" is null')
    expect(q.params).toEqual(expect.arrayContaining(['org-a', 'acc-1']))
  })

  it('livre quando não acha nada', async () => {
    const { db } = dbFalso([])
    expect(await contaOcupada(db, 'org-a', 'acc-1')).toBe(false)
  })

  it('exceto o próprio recurso (revincular é idempotente)', async () => {
    const { db, consultas } = dbFalso([])
    await contaOcupada(db, 'org-a', 'acc-1', 'res-9')
    expect(consultas[0].sql).toContain('<>')
    expect(consultas[0].params).toContain('res-9')
  })
})
