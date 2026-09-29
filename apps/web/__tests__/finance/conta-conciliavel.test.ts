import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { contaConciliavel } from '@/lib/finance/conciliacao/conta-conciliavel'

/**
 * Conta conciliável = conta corrente/poupança com recurso Open Finance vivo
 * (Ruling P12). Cartão OF e recurso fora do ar ficam de fora do motor.
 */
const dialect = new PgDialect()
let resultado: unknown[] = []
const wheres: SQL[] = []

function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r) }
  c.from = () => c
  c.limit = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  return c
}
const db: any = { select: () => chain() }

beforeEach(() => { resultado = []; wheres.length = 0 })

describe('contaConciliavel', () => {
  it('filtra recurso vivo do tipo ACCOUNT, da org e da conta', async () => {
    await contaConciliavel(db, 'org-1', 'nubank')
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"resource_type" = $')
    expect(q.sql).toContain('"status" = $')
    expect(q.params).toEqual(['org-1', 'nubank', 'AVAILABLE', 'ACCOUNT'])
    // CREDIT_CARD_ACCOUNT e status ≠ AVAILABLE não passam no filtro.
    expect(q.params).not.toContain('CREDIT_CARD_ACCOUNT')
  })

  it('com recurso ACCOUNT vivo: verdadeiro', async () => {
    resultado = [{ id: 'recurso' }]
    expect(await contaConciliavel(db, 'org-1', 'nubank')).toBe(true)
  })

  it('sem recurso que passe no filtro (cartão, recurso fora do ar, conta manual): falso', async () => {
    expect(await contaConciliavel(db, 'org-1', 'cartao')).toBe(false)
  })
})
