import { beforeEach, describe, expect, it, vi } from 'vitest'

const inserts: any[] = []
const updates: any[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'onConflictDoNothing', 'returning']) c[m] = () => c
  c.set = (p: unknown) => { updates.push(p); return c }
  return c
}

const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => chain([]),
  insert: () => ({ values: (v: unknown) => { inserts.push(v); return chain([{ id: 'nova' }]) } }),
  transaction: async (fn: (t: unknown) => unknown) => fn(db),
}

const propor = vi.fn(async (..._a: unknown[]) => 0)
vi.mock('@/lib/finance/forecast-match-db', () => ({ criarPropostasDeConciliacao: (...a: unknown[]) => propor(...a) }))

const { criarPernasPrevistasFaltantes } = await import('@/lib/openfinance/pernas-faltantes')

describe('criarPernasPrevistasFaltantes', () => {
  beforeEach(() => {
    inserts.length = 0
    updates.length = 0
    selectQueue.length = 0
    propor.mockClear()
  })

  it('transferência confirmada só com metadado e destino Open Finance ganha perna prevista e proposta', async () => {
    selectQueue.push([{
      id: 'tx-1', accountId: 'itau', amountCents: -50000, date: new Date('2026-09-10T12:00:00Z'),
      externalId: 'ext-1', transferAccountId: 'nubank', balanceApplied: true,
    }])
    selectQueue.push([{ id: 'recurso-nubank' }]) // isOpenFinanceLinkedAccount: linked

    const { criadas } = await criarPernasPrevistasFaltantes(db, 'org-1')

    expect(criadas).toBe(1)
    expect(inserts[0]).toMatchObject({ accountId: 'nubank', externalId: 'ext-1:transfer-par', balanceApplied: false, transferAccountId: 'itau' })
    expect(updates[0]).toMatchObject({ transferGroupId: inserts[0].transferGroupId })
    expect(propor).toHaveBeenCalledWith(db, 'org-1', 'nubank')
  })

  it('destino que não é mais Open Finance fica como está', async () => {
    selectQueue.push([{
      id: 'tx-2', accountId: 'itau', amountCents: -50000, date: new Date('2026-09-10T12:00:00Z'),
      externalId: 'ext-2', transferAccountId: 'manual', balanceApplied: true,
    }])
    selectQueue.push([]) // não linked

    const { criadas } = await criarPernasPrevistasFaltantes(db, 'org-1')
    expect(criadas).toBe(0)
  })
})
