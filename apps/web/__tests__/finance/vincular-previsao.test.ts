import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `vincularPrevisao` é o "Vincular" do card do modo foco: liga o realizado a
 * QUALQUER previsão aberta, não só a que o sync propôs. A gravação em si —
 * reconferir as duas pontas, herdar categoria, decidir as propostas
 * concorrentes — mora em `vincularNoBanco`, compartilhada com `aprovarProposta`
 * (ver o docblock dela em `forecast-match-actions.ts` para o porquê de cada
 * checagem).
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
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', matchedTransactionId: 'matched_transaction_id', balanceApplied: 'balance_applied', isIgnored: 'is_ignored', externalId: 'external_id', transferAccountId: 'transfer_account_id', type: 'type', categoryId: 'category_id', reviewState: 'review_state', aguardaExtrato: 'aguarda_extrato', origem: 'origem', description: 'description', transferGroupId: 'transfer_group_id', accountId: 'account_id', isAutoCategorized: 'is_auto_categorized' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, id: 'id', orgId: 'org_id', status: 'status', decidedAt: 'decided_at', forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))
vi.mock('@/lib/finance/conciliacao/absorver', () => ({ aplicarEfeitoDaAbsorcao: vi.fn() }))
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn() }))

const { vincularPrevisao } = await import('@/lib/finance/conciliacao/vincular-actions')
const { aplicarEfeitoDaAbsorcao } = await import('@/lib/finance/conciliacao/absorver')

const PREV = { id: 'prev-1', matchedTransactionId: null, balanceApplied: false, isIgnored: false, aguardaExtrato: false, type: 'expense', categoryId: 'cat-9', origem: 'recorrencia' }
const REAL = { id: 'real-1', matchedTransactionId: null, balanceApplied: true, isIgnored: false, reviewState: 'pending', origem: 'extrato' }

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  vi.clearAllMocks()
})

describe('vincularPrevisao', () => {
  it('grava o vínculo, herda a categoria da previsão e decide as propostas', async () => {
    selectQueue.push([PREV, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true })
    const updates = ops.filter((o) => o.op.startsWith('update'))
    expect(updates[0]).toMatchObject({ op: 'update:transactions', payload: { matchedTransactionId: 'real-1' } })
    expect(updates[1]).toMatchObject({ op: 'update:transactions', payload: { type: 'expense', categoryId: 'cat-9', reviewState: 'confirmed' } })
    expect(updates.filter((o) => o.op === 'update:forecast_match_proposals')).toHaveLength(2)
  })
  it('previsão de transferência que aguarda extrato segue o efeito da absorção', async () => {
    selectQueue.push([{ ...PREV, aguardaExtrato: true, type: 'transfer', categoryId: null }, REAL], [])
    await vincularPrevisao('real-1', 'prev-1')
    expect(aplicarEfeitoDaAbsorcao).toHaveBeenCalled()
  })
  it.each([
    ['previsão já vinculada', [{ ...PREV, matchedTransactionId: 'outro' }, REAL], []],
    ['previsão já no saldo', [{ ...PREV, balanceApplied: true }, REAL], []],
    ['realizado ignorado', [PREV, { ...REAL, isIgnored: true }], []],
    ['realizado já reivindicado por outra previsão', [PREV, REAL], [{ id: 'prev-2' }]],
    ['ponta de outra org (não volta)', [REAL], []],
  ])('%s → efetivada false, nada gravado', async (_, pontas, reivindicado) => {
    selectQueue.push(pontas as unknown[], reivindicado as unknown[])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: false })
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})
