import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'

const ORG = 'org-1'
const COUNTERPARTY_ID = '11111111-1111-1111-1111-111111111111'
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222'

interface Op { op: 'select' | 'update'; table: string }
const ops: Op[] = []
const selectQueue: unknown[][] = []
const updateQueue: unknown[][] = []

function makeChain(result: unknown[]): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => chain,
    finally: () => chain,
  }
  for (const m of ['from', 'where', 'limit', 'set', 'returning']) chain[m] = () => makeChain(result)
  return chain
}

// `revalidateTransactionData`/`revalidateSnapshotData`/`invalidateTag` chamam
// `revalidateTag` do Next por baixo, que fora de um request real lança
// "Invariant: static generation store missing" — mesmo mock de
// `__tests__/finance/actions.test.ts`, na mesma origem.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => ORG) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
  })),
}))
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      transaction: async (fn: (tx: unknown) => unknown) => fn({
        select: (sel: any) => {
          ops.push({ op: 'select', table: getTableName(sel?.from ?? sel) })
          return { from: (table: any) => { ops[ops.length - 1].table = getTableName(table); return makeChain(selectQueue.shift() ?? []) } }
        },
        update: (table: any) => {
          ops.push({ op: 'update', table: getTableName(table) })
          return makeChain(updateQueue.shift() ?? [])
        },
      }),
    }),
  }
})

import { confirmCounterparty } from '@/lib/openfinance/counterparty-actions'

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  updateQueue.length = 0
})

describe('confirmCounterparty', () => {
  it('rejeita categoria em transferência', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: CATEGORY_ID }),
    ).rejects.toThrow()
  })

  it('rejeita despesa sem categoria', async () => {
    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: null }),
    ).rejects.toThrow()
  })

  it('atualiza a contraparte e só as transações pendentes dela', async () => {
    selectQueue.push([{ id: COUNTERPARTY_ID }]) // contraparte pertence à org
    updateQueue.push([]) // update de counterparties não retorna nada relevante
    updateQueue.push([{ id: 'tx-1' }, { id: 'tx-2' }]) // 2 transações reclassificadas

    const result = await confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'expense', categoryId: CATEGORY_ID })

    expect(result.reclassified).toBe(2)
    expect(ops.filter((o) => o.op === 'update').map((o) => o.table)).toEqual(['counterparties', 'transactions'])
  })

  it('contraparte de outra org não é encontrada', async () => {
    selectQueue.push([]) // nenhuma linha — a cerca de org bloqueou

    await expect(
      confirmCounterparty({ counterpartyId: COUNTERPARTY_ID, nature: 'transfer', categoryId: null }),
    ).rejects.toThrow(/não encontrada/)
  })
})
