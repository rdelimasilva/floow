import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Editar o valor de compra move a base da estimativa enquanto ela ainda é a
 * própria compra (base com data até a da compra: ninguém usou "Atualizar
 * valor" depois). O Terreno Altavis foi de R$ 350 mil para R$ 230 mil na
 * compra e o valor estimado continuou partindo dos R$ 350 mil.
 *
 * Avaliação feita depois da compra é do usuário: editar a compra não a toca.
 */

interface Op {
  op: 'select' | 'insert' | 'update'
  table: string
  payload?: Record<string, unknown>
}

const ops: Op[] = []
const selectQueue: unknown[][] = []

function makeChain(result: unknown[], current?: Op): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'returning', 'orderBy', 'leftJoin', 'innerJoin']) {
    chain[m] = () => makeChain(result, current)
  }
  for (const m of ['values', 'set']) {
    chain[m] = (payload: Record<string, unknown>) => {
      if (current) current.payload = payload
      return makeChain(result, current)
    }
  }
  return chain
}

function record(op: Op) {
  ops.push(op)
  return op
}

const mockDb = {
  select: () => makeChain(selectQueue.shift() ?? [], record({ op: 'select', table: '?' })),
  insert: (t: { _table: string }) => makeChain([{ id: 'asset-1' }], record({ op: 'insert', table: t._table })),
  update: (t: { _table: string }) => makeChain([], record({ op: 'update', table: t._table })),
}

vi.mock('@floow/db', () => ({
  getDb: () => mockDb,
  fixedAssets: { _table: 'fixed_assets' },
  fixedAssetTypes: { _table: 'fixed_asset_types' },
  transactions: { _table: 'transactions' },
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/cache-tags', () => ({
  fixedAssetsTag: () => 'tag-assets',
  fixedAssetTypesTag: () => 'tag-types',
  snapshotsTag: () => 'tag-snapshots',
  invalidateTag: vi.fn(),
}))

const { updateFixedAsset } = await import('@/lib/fixed-assets/actions')

const ID = '33333333-3333-4333-8333-333333333333'
const TYPE_ID = '22222222-2222-4222-8222-222222222222'

function form(extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.append('id', ID)
  fd.append('name', 'Terreno Altavis')
  fd.append('typeId', TYPE_ID)
  fd.append('purchaseValueCents', '23000000')
  fd.append('purchaseDate', '2025-08-19')
  fd.append('annualRate', '0.05')
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

function payloadDoUpdate() {
  return ops.find((o) => o.op === 'update' && o.table === 'fixed_assets')?.payload
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('updateFixedAsset e a base da estimativa', () => {
  it('base ainda é a compra: acompanha o novo valor e a nova data', async () => {
    selectQueue.push([{ purchaseDate: new Date('2025-08-19'), currentValueDate: new Date('2025-08-19') }])

    await updateFixedAsset(form({ purchaseDate: '2025-09-01' }))

    expect(payloadDoUpdate()?.currentValueCents).toBe(23000000)
    expect(payloadDoUpdate()?.currentValueDate).toEqual(new Date('2025-09-01'))
  })

  it('avaliação feita depois da compra fica como está', async () => {
    selectQueue.push([{ purchaseDate: new Date('2025-08-19'), currentValueDate: new Date('2026-06-01') }])

    await updateFixedAsset(form())

    expect(payloadDoUpdate()).not.toHaveProperty('currentValueCents')
    expect(payloadDoUpdate()).not.toHaveProperty('currentValueDate')
    expect(payloadDoUpdate()?.purchaseValueCents).toBe(23000000)
  })
})
