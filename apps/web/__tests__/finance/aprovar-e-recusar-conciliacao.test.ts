import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Aprovar é o único caminho que grava `matched_transaction_id`. É ele que
 * efetiva a conciliação, e por isso as duas escritas — vínculo na previsão e
 * status na proposta — vão na MESMA transação: meio caminho deixaria uma
 * previsão casada com proposta ainda pendente, que a fila mostraria de novo.
 *
 * Recusar não toca na previsão: ela segue aberta e elegível a outra proposta
 * num sync futuro. O par recusado é barrado pelo índice único, não aqui.
 */

const ops: { op: string; payload?: Record<string, unknown> }[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], atual?: { op: string; payload?: Record<string, unknown> }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning', 'leftJoin']) c[m] = () => chain(result, atual)
  c.set = (payload: Record<string, unknown>) => { if (atual) atual.payload = payload; return chain(result, atual) }
  return c
}

const tx = {
  select: () => { const op = { op: 'select' }; ops.push(op); return chain(selectQueue.shift() ?? [], op) },
  update: (table: unknown) => {
    const op = { op: `update:${(table as { _?: { name?: string } })?._?.name}` }
    ops.push(op)
    return chain([{ id: 'x' }], op)
  },
}

vi.mock('@floow/db', () => ({
  getDb: () => ({ transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) }),
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', matchedTransactionId: 'matched_transaction_id' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, id: 'id', orgId: 'org_id', status: 'status', decidedAt: 'decided_at', forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { aprovarProposta, recusarProposta } = await import('@/lib/finance/forecast-match-actions')

const PENDENTE = {
  id: 'prop-1',
  forecastTransactionId: 'prev-1',
  realizedTransactionId: 'real-1',
  status: 'pending',
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('aprovarProposta', () => {
  it('grava o vínculo na previsão e fecha a proposta', async () => {
    selectQueue.push([PENDENTE])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(true)
    const naPrevisao = ops.find((o) => o.op === 'update:transactions')
    expect(naPrevisao?.payload).toMatchObject({ matchedTransactionId: 'real-1' })
    const naProposta = ops.find((o) => o.op === 'update:forecast_match_proposals')
    expect(naProposta?.payload).toMatchObject({ status: 'approved' })
    expect(naProposta?.payload?.decidedAt).toBeInstanceOf(Date)
  })

  it('proposta que não está pendente não faz nada — clique duplo não é erro', async () => {
    selectQueue.push([])

    const { efetivada } = await aprovarProposta('prop-1')

    expect(efetivada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})

describe('recusarProposta', () => {
  it('fecha a proposta e não toca na previsão', async () => {
    selectQueue.push([PENDENTE])

    const { recusada } = await recusarProposta('prop-1')

    expect(recusada).toBe(true)
    expect(ops.some((o) => o.op === 'update:transactions')).toBe(false)
    expect(ops.find((o) => o.op === 'update:forecast_match_proposals')?.payload)
      .toMatchObject({ status: 'refused' })
  })

  it('proposta já decidida não faz nada', async () => {
    selectQueue.push([])

    const { recusada } = await recusarProposta('prop-1')

    expect(recusada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})
