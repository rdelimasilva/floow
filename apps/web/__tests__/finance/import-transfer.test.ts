import { describe, it, expect, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { inserirTransferenciaImportada } from '@/lib/finance/import-transfer'

const inserts: any[] = []
const updates: string[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'set', 'onConflictDoNothing', 'returning']) c[m] = () => c
  return c
}
const tx: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: unknown) => { inserts.push(v); return chain([]) } }),
  update: (t: any) => { updates.push(getTableName(t)); return chain([]) },
}

const BASE = {
  orgId: 'org-1', accountId: 'itau', destAccountId: 'nubank', amountCents: -50000,
  description: 'TED', date: new Date('2026-09-10T12:00:00Z'), externalId: 'fitid-1',
  importedAt: new Date(), categoryId: null,
}

beforeEach(() => { inserts.length = 0; updates.length = 0; selectQueue.length = 0 })

describe('inserirTransferenciaImportada', () => {
  it('destino Open Finance: perna prevista, só o saldo da origem muda', async () => {
    selectQueue.push([{ id: 'recurso' }]) // linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBe('nubank')
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', externalId: 'fitid-1:transfer-par', balanceApplied: false })
    expect(updates).toEqual(['accounts'])
  })

  it('destino manual: duas pernas reais e dois saldos, como antes', async () => {
    selectQueue.push([]) // não linked
    const r = await inserirTransferenciaImportada(tx, BASE)
    expect(r.destinoPrevisto).toBeNull()
    expect(inserts[1]).toMatchObject({ accountId: 'nubank', amountCents: 50000 })
    expect(updates).toEqual(['accounts', 'accounts'])
  })
})
