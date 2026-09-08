import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O override por lançamento: três estados, porque `null` significa "herda da
 * categoria" e é diferente de "explicitamente dentro do fluxo".
 *
 * A diferença importa: enquanto está `null`, mudar o checkbox da categoria
 * arrasta o lançamento junto. Com valor explícito ele fica parado, que é o
 * ponto de ser exceção.
 *
 * A ordem do ciclo começa pelo que o usuário quer na maioria dos casos —
 * tirar aquele lançamento do fluxo. "Explicitamente dentro" é o estado raro e
 * fica por último.
 */

const ops: { op: string; payload?: Record<string, unknown> }[] = []
const selectQueue: unknown[][] = []

function makeChain(result: unknown[], current?: { op: string; payload?: Record<string, unknown> }): any {
  const chain: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const m of ['from', 'where', 'limit', 'returning']) chain[m] = () => makeChain(result, current)
  chain.set = (payload: Record<string, unknown>) => {
    if (current) current.payload = payload
    return makeChain(result, current)
  }
  return chain
}

const mockDb = {
  select: () => {
    const op = { op: 'select' }
    ops.push(op)
    return makeChain(selectQueue.shift() ?? [], op)
  },
  update: () => {
    const op = { op: 'update' }
    ops.push(op)
    return makeChain([], op)
  },
}

vi.mock('@floow/db', () => ({
  getDb: () => mockDb,
  transactions: { _table: 'transactions' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { setTransactionAffectsCashFlow } = await import('@/lib/finance/cash-flow-actions')
const { nextAffectsCashFlow } = await import('@/lib/finance/affects-cash-flow-cycle')

const TX = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('nextAffectsCashFlow', () => {
  it('herda vira fora do fluxo — o primeiro clique faz o caso comum', () => {
    expect(nextAffectsCashFlow(null)).toBe(false)
    expect(nextAffectsCashFlow(undefined)).toBe(false)
  })

  it('fora vira explicitamente dentro', () => {
    expect(nextAffectsCashFlow(false)).toBe(true)
  })

  it('dentro volta a herdar', () => {
    expect(nextAffectsCashFlow(true)).toBeNull()
  })
})

describe('setTransactionAffectsCashFlow', () => {
  it('grava o valor no lançamento da org', async () => {
    selectQueue.push([{ id: TX }])

    await setTransactionAffectsCashFlow(TX, false)

    expect(ops.find((o) => o.op === 'update')?.payload?.affectsCashFlow).toBe(false)
  })

  it('grava null para voltar a herdar da categoria', async () => {
    selectQueue.push([{ id: TX }])

    await setTransactionAffectsCashFlow(TX, null)

    expect(ops.find((o) => o.op === 'update')?.payload?.affectsCashFlow).toBeNull()
  })

  it('recusa lançamento de outra org, sem gravar', async () => {
    selectQueue.push([])

    await expect(setTransactionAffectsCashFlow(TX, false)).rejects.toThrow(/não encontrado/i)
    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })
})
