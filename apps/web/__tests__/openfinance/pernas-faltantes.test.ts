import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const inserts: any[] = []
// Condições de `where`, na ordem: o mock descarta o resto, e filtro só se
// prova renderizando o SQL.
const wheres: SQL[] = []
const updates: any[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'onConflictDoNothing', 'returning']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
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
vi.mock('@/lib/finance/forecast-match-db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/forecast-match-db')>('@/lib/finance/forecast-match-db')
  return { ...actual, criarPropostasDeConciliacao: (...a: unknown[]) => propor(...a) }
})

const { criarPernasPrevistasFaltantes } = await import('@/lib/openfinance/pernas-faltantes')

describe('criarPernasPrevistasFaltantes', () => {
  beforeEach(() => {
    inserts.length = 0
    updates.length = 0
    selectQueue.length = 0
    wheres.length = 0
    propor.mockClear()
  })

  it('ponta real que a conciliação já converteu em transferência fica de fora', async () => {
    // `aprovarProposta` grava `transfer_account_id` na ponta real e a deixa
    // sem grupo. Sem este filtro ela pareceria "transferência sem par" e
    // ganharia uma perna prevista de volta na conta de origem.
    await criarPernasPrevistasFaltantes(db, 'org-1')

    const gerado = new PgDialect().sqlToQuery(wheres[0]).sql.toLowerCase()
    expect(gerado).toContain('"matched_transaction_id" = "transactions"."id"')
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

  it('o outro lado já criou a perna prevista aqui: não cria outra, propõe o par nesta conta', async () => {
    selectQueue.push([{
      id: 'tx-3', accountId: 'nubank', amountCents: 50000, date: new Date('2026-09-10T12:00:00Z'),
      externalId: 'ext-3', transferAccountId: 'itau', balanceApplied: true,
    }])
    selectQueue.push([{ id: 'recurso-itau' }]) // isOpenFinanceLinkedAccount: linked
    selectQueue.push([{ id: 'perna-do-itau' }]) // acharPernaPrevistaAberta: achou

    const { criadas } = await criarPernasPrevistasFaltantes(db, 'org-1')

    expect(criadas).toBe(0)
    expect(inserts).toEqual([])
    expect(updates).toEqual([])
    expect(propor).toHaveBeenCalledWith(db, 'org-1', 'nubank')
    expect(propor).not.toHaveBeenCalledWith(db, 'org-1', 'itau')
  })
})
