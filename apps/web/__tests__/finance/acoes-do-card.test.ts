import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * As outras três ações do card do modo foco: "Não é nenhum" (marcarSemVinculo),
 * "classificar só este" (classificarSoEste) e "procurar previsão"
 * (procurarPrevisoes). Mesmo arnês de mock da Task 6
 * (`vincular-previsao.test.ts`); `procurarPrevisoes` é consulta pura de
 * leitura e não tem teste aqui — coberta na verificação com banco real da
 * parte 2 (Task 11).
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
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', matchedTransactionId: 'matched_transaction_id', balanceApplied: 'balance_applied', isIgnored: 'is_ignored', externalId: 'external_id', transferAccountId: 'transfer_account_id', type: 'type', categoryId: 'category_id', reviewState: 'review_state', aguardaExtrato: 'aguarda_extrato', origem: 'origem', description: 'description', transferGroupId: 'transfer_group_id', accountId: 'account_id', isAutoCategorized: 'is_auto_categorized', vinculoRevisadoEm: 'vinculo_revisado_em', date: 'date', amountCents: 'amount_cents' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, id: 'id', orgId: 'org_id', status: 'status', decidedAt: 'decided_at', forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id' },
  counterparties: { _: { name: 'counterparties' } },
  accounts: { _: { name: 'accounts' }, id: 'id', name: 'name' },
  categories: { _: { name: 'categories' }, id: 'id', name: 'name' },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))
vi.mock('@/lib/finance/conciliacao/absorver', () => ({ aplicarEfeitoDaAbsorcao: vi.fn() }))
vi.mock('@/lib/db/rls', () => ({ withUserDb: vi.fn() }))
vi.mock('@/lib/openfinance/aplicar-regra', () => ({ aplicarDecisaoAosPendentes: vi.fn().mockResolvedValue(1) }))
vi.mock('@/lib/finance/account-actions', () => ({ assertAccountOwnership: vi.fn() }))
vi.mock('@/lib/finance/conciliacao/conciliar-conta', () => ({ conciliarContas: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({ accountsTag: () => 't', invalidateTag: vi.fn() }))

const { marcarSemVinculo, classificarSoEste } = await import('@/lib/finance/conciliacao/vincular-actions')
const { aplicarDecisaoAosPendentes } = await import('@/lib/openfinance/aplicar-regra')

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
  vi.clearAllMocks()
  vi.mocked(aplicarDecisaoAosPendentes).mockResolvedValue(1)
})

describe('marcarSemVinculo', () => {
  it('grava vinculo_revisado_em e recusa as propostas pendentes do lançamento', async () => {
    expect(await marcarSemVinculo('real-1')).toEqual({ ok: true })
    expect(ops[0]).toMatchObject({ op: 'update:transactions' })
    expect(ops[0].payload!.vinculoRevisadoEm).toBeInstanceOf(Date)
    expect(ops[1]).toMatchObject({ op: 'update:forecast_match_proposals', payload: { status: 'refused' } })
  })
})

describe('classificarSoEste', () => {
  it('aplica só a este lançamento e não grava regra na contraparte', async () => {
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'expense', categoryId: '00000000-0000-4000-8000-000000000003', transferAccountId: null })
    expect(r).toEqual({ ok: true })
    expect(vi.mocked(aplicarDecisaoAosPendentes).mock.calls[0][4]).toEqual(['00000000-0000-4000-8000-000000000001'])
    expect(ops.some((o) => o.op === 'update:counterparties')).toBe(false)
  })
  it('natureza incoerente com o destino devolve { error }', async () => {
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'transfer', categoryId: null, transferAccountId: null })
    expect(r).toHaveProperty('error')
  })
  it('nada pendente para classificar devolve { error }', async () => {
    vi.mocked(aplicarDecisaoAosPendentes).mockResolvedValueOnce(0)
    const r = await classificarSoEste({ transactionId: '00000000-0000-4000-8000-000000000001', counterpartyId: '00000000-0000-4000-8000-000000000002', nature: 'expense', categoryId: '00000000-0000-4000-8000-000000000003', transferAccountId: null })
    expect(r).toEqual({ error: 'Este lançamento já foi classificado. A fila foi atualizada.' })
  })
})
