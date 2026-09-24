import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const wheres: SQL[] = []

function chain(): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve([]).then(r) }
  c.from = () => c
  c.limit = () => c
  c.where = (cond: SQL) => { wheres.push(cond); return c }
  return c
}

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({ select: () => chain() }) }
})
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateTransactionData: vi.fn(), revalidateSnapshotData: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({ accountsTag: vi.fn(), investmentsTag: vi.fn(), invalidateTag: vi.fn() }))

const { applyDueBankTransactions } = await import('@/lib/finance/apply-due')

describe('applyDueBankTransactions', () => {
  it('exclui a perna prevista de transferência: ela nunca entra no saldo por data', async () => {
    await applyDueBankTransactions()
    const q = new PgDialect().sqlToQuery(wheres[0])
    expect(q.sql).toContain('not like')
    expect(q.params).toContain('%:transfer-par')
  })
})
