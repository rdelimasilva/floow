import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O vínculo entre o bem e o lançamento que o adquiriu.
 *
 * Por que vínculo e não conta de ativos imobilizados: `computeSnapshot`
 * (`packages/core-finance/src/snapshot.ts`) soma TODOS os saldos de conta e
 * depois adiciona `fixedAssetValueCents` por cima. Um bem que fosse conta
 * contaria duas vezes no patrimônio — e o saldo de conta não se move sozinho,
 * então a depreciação de `estimateAssetValue` deixaria de refletir.
 *
 * A cerca de posse é o ponto sensível: sem ela, um `acquisitionTransactionId`
 * de outra org gravaria referência cross-tenant, do mesmo jeito que
 * `assertAccountOwnership` impede em `lib/finance/actions.ts`.
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

const { createFixedAsset } = await import('@/lib/fixed-assets/actions')

const TX_ID = '11111111-1111-4111-8111-111111111111'
const TYPE_ID = '22222222-2222-4222-8222-222222222222'

function form(extra: Record<string, string> = {}) {
  const fd = new FormData()
  fd.append('name', 'Fusca')
  fd.append('typeId', TYPE_ID)
  fd.append('purchaseValueCents', '5000000')
  fd.append('purchaseDate', '2026-01-10')
  fd.append('annualRate', '-0.1')
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  return fd
}

function payloadDoInsert() {
  return ops.find((o) => o.op === 'insert' && o.table === 'fixed_assets')?.payload
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('createFixedAsset e o lançamento de aquisição', () => {
  it('grava o vínculo quando o lançamento é desta org', async () => {
    selectQueue.push([{ id: TX_ID }]) // cerca de posse encontra o lançamento

    await createFixedAsset(form({ acquisitionTransactionId: TX_ID }))

    expect(payloadDoInsert()?.acquisitionTransactionId).toBe(TX_ID)
  })

  it('grava null quando o form não manda vínculo', async () => {
    await createFixedAsset(form())

    expect(payloadDoInsert()?.acquisitionTransactionId).toBeNull()
  })

  it('recusa lançamento que não é desta org, sem gravar nada', async () => {
    selectQueue.push([]) // cerca de posse não encontra

    await expect(createFixedAsset(form({ acquisitionTransactionId: TX_ID }))).rejects.toThrow(
      /lançamento/i,
    )
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })
})
