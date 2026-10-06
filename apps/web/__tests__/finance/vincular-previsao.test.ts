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
vi.mock('@/lib/finance/conciliacao/registro', () => ({ registrarVinculo: vi.fn() }))

const { vincularPrevisao } = await import('@/lib/finance/conciliacao/vincular-actions')
const { aplicarEfeitoDaAbsorcao } = await import('@/lib/finance/conciliacao/absorver')
const { registrarVinculo } = await import('@/lib/finance/conciliacao/registro')

const PREV = { id: 'prev-1', accountId: 'itau', amountCents: -15000, matchedTransactionId: null, balanceApplied: false, isIgnored: false, aguardaExtrato: false, type: 'expense', categoryId: 'cat-9', origem: 'recorrencia' }
const REAL = { id: 'real-1', accountId: 'itau', amountCents: -15000, matchedTransactionId: null, balanceApplied: true, isIgnored: false, reviewState: 'pending', origem: 'extrato' }

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  vi.clearAllMocks()
})

describe('vincularPrevisao', () => {
  it('grava o vínculo, herda a categoria da previsão e decide as propostas', async () => {
    selectQueue.push([PREV, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: true })
    const updates = ops.filter((o) => o.op.startsWith('update'))
    expect(updates[0]).toMatchObject({ op: 'update:transactions', payload: { matchedTransactionId: 'real-1' } })
    expect(updates[1]).toMatchObject({ op: 'update:transactions', payload: { type: 'expense', categoryId: 'cat-9', reviewState: 'confirmed' } })
    // As concorrentes são recusadas; o par ganha o registro que a 00073 exige.
    expect(updates.filter((o) => o.op === 'update:forecast_match_proposals')).toHaveLength(1)
    expect(registrarVinculo).toHaveBeenCalledWith(tx, 'org-1', 'prev-1', 'real-1', 'usuario')
  })
  it('troca pelo card: previsão presa a outro lançamento, com proposta de troca pendente do par, solta o vínculo antigo', async () => {
    selectQueue.push([{ ...PREV, matchedTransactionId: 'unimed' }, REAL], [{ id: 'prop-troca' }], [])
    expect((await vincularPrevisao('real-1', 'prev-1')).efetivada).toBe(true)
    const updates = ops.filter((o) => o.op.startsWith('update'))
    expect(updates[0]).toMatchObject({ op: 'update:forecast_match_proposals', payload: { status: 'refused', decisao: 'usuario' } })
    expect(updates[1]).toMatchObject({ op: 'update:transactions', payload: { matchedTransactionId: 'real-1' } })
  })
  it('previsão presa a outro lançamento sem proposta de troca: não vincula', async () => {
    selectQueue.push([{ ...PREV, matchedTransactionId: 'unimed' }, REAL], [])
    expect((await vincularPrevisao('real-1', 'prev-1')).efetivada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
  it('previsão de transferência que aguarda extrato segue o efeito da absorção', async () => {
    vi.mocked(aplicarEfeitoDaAbsorcao).mockResolvedValue(true)
    selectQueue.push([{ ...PREV, aguardaExtrato: true, type: 'transfer', categoryId: null }, REAL], [])
    // A perna não tem categoria, mas a absorção confirma o realizado como transferência.
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: true })
    expect(aplicarEfeitoDaAbsorcao).toHaveBeenCalled()
  })
  it('absorção sem efeito (espelho OF↔OF): vinculou, mas o realizado segue pendente', async () => {
    vi.mocked(aplicarEfeitoDaAbsorcao).mockResolvedValue(false)
    selectQueue.push([{ ...PREV, aguardaExtrato: true, type: 'transfer', categoryId: null }, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: false })
  })
  it('previsão sem categoria (ou com a categoria apagada): vinculou, segue pendente', async () => {
    selectQueue.push([{ ...PREV, categoryId: null }, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: false })
  })
  it('realizado já confirmado: nada a classificar', async () => {
    selectQueue.push([{ ...PREV, categoryId: null }, { ...REAL, reviewState: 'confirmed' }], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: true })
  })
  it('previsão comum de outra conta, mesmo sinal, ainda vincula (Procurar previsão é entre contas)', async () => {
    selectQueue.push([{ ...PREV, accountId: 'nubank' }, REAL], [])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: true, classificou: true })
  })
  it.each([
    ['previsão já vinculada', [{ ...PREV, matchedTransactionId: 'outro' }, REAL], []],
    ['previsão já no saldo', [{ ...PREV, balanceApplied: true }, REAL], []],
    ['realizado ignorado', [PREV, { ...REAL, isIgnored: true }], []],
    ['realizado já reivindicado por outra previsão', [PREV, REAL], [{ id: 'prev-2' }]],
    ['ponta de outra org (não volta)', [REAL], []],
    ['realizado é previsão (fora do saldo)', [PREV, { ...REAL, balanceApplied: false }], []],
    ['realizado com vínculo próprio', [PREV, { ...REAL, matchedTransactionId: 'x' }], []],
    // Saída prevista cumprida por uma entrada: o saldo projetado sairia com o sinal trocado.
    ['sinal oposto (previsão de saída, realizado de entrada)', [PREV, { ...REAL, amountCents: 15000 }], []],
    ['sinal oposto (previsão de entrada, realizado de saída)', [{ ...PREV, amountCents: 15000 }, REAL], []],
    // A perna é da conta dela: absorvê-la pelo extrato de outra conta vira transferência para si mesma.
    ['perna que aguarda extrato, de outra conta', [{ ...PREV, aguardaExtrato: true, type: 'transfer', categoryId: null, accountId: 'nubank' }, REAL], []],
  ])('%s → efetivada false, nada gravado', async (_, pontas, reivindicado) => {
    selectQueue.push(pontas as unknown[], reivindicado as unknown[])
    expect(await vincularPrevisao('real-1', 'prev-1')).toEqual({ efetivada: false, classificou: false })
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })

  it('previsão e realizado não podem ser o mesmo lançamento', async () => {
    selectQueue.push([PREV])
    expect(await vincularPrevisao('prev-1', 'prev-1')).toEqual({ efetivada: false, classificou: false })
    expect(ops.some((o) => o.op.startsWith('update'))).toBe(false)
  })
})
