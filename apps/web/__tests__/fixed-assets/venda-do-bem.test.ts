import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Venda do bem (migration 00083): o bem sai do patrimônio (`isActive = false`)
 * e guarda a entrada que recebeu o dinheiro, com data e valor copiados dela.
 * Só entrada desta org serve.
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

const { sellFixedAsset } = await import('@/lib/fixed-assets/actions')

const TX_ID = '11111111-1111-4111-8111-111111111111'

function form(saleTransactionId = TX_ID) {
  const fd = new FormData()
  fd.append('id', 'asset-1')
  fd.append('saleTransactionId', saleTransactionId)
  return fd
}

function payloadDoUpdate() {
  return ops.find((o) => o.op === 'update' && o.table === 'fixed_assets')?.payload
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('sellFixedAsset', () => {
  it('tira o bem do patrimônio e copia data e valor da entrada', async () => {
    const dia = new Date('2026-10-20T00:00:00Z')
    selectQueue.push([{ id: TX_ID, date: dia, amountCents: 4500000 }])

    await sellFixedAsset(form())

    expect(payloadDoUpdate()).toMatchObject({
      isActive: false, soldAt: dia, saleValueCents: 4500000, saleTransactionId: TX_ID,
    })
  })

  it('recusa lançamento de outra org, sem gravar nada', async () => {
    selectQueue.push([])

    await expect(sellFixedAsset(form())).rejects.toThrow(/não encontrado/)
    expect(payloadDoUpdate()).toBeUndefined()
  })

  it('recusa saída de dinheiro como venda', async () => {
    selectQueue.push([{ id: TX_ID, date: new Date(), amountCents: -100 }])

    await expect(sellFixedAsset(form())).rejects.toThrow(/entrada/)
    expect(payloadDoUpdate()).toBeUndefined()
  })
})
