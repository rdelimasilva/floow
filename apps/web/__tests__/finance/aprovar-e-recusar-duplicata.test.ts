import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Aprovar uma duplicata marca `is_ignored` e estorna o saldo.
 *
 * Ignorar e nao apagar: `is_ignored` ja significa "este lancamento e errado,
 * nao existe" no schema, ja o tira de orcamentos, dividas e CFO, e deixa a
 * decisao reversivel — quem descobrir depois que eram dois pagamentos de
 * verdade desfaz num clique, coisa que o delete nao permite.
 *
 * O estorno so vale para o que ENTROU no saldo: um agendado com
 * `balance_applied = false` nunca foi somado, e reverte-lo cobraria o que
 * ninguem cobrou — o mesmo erro que `toggleIgnoreTransaction` comete e que
 * esta action nao pode repetir.
 */

const ops: { op: string; payload?: Record<string, unknown> }[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], atual?: { op: string; payload?: Record<string, unknown> }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning']) c[m] = () => chain(result, atual)
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
  getDb: () => ({
    transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    update: (table: unknown) => {
      const op = { op: `update:${(table as { _?: { name?: string } })?._?.name}` }
      ops.push(op)
      return chain([{ id: 'prop-1' }], op)
    },
  }),
  accounts: { _: { name: 'accounts' }, id: 'id', orgId: 'org_id', balanceCents: 'balance_cents' },
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', isIgnored: 'is_ignored', balanceApplied: 'balance_applied' },
  duplicateProposals: {
    _: { name: 'duplicate_proposals' },
    id: 'id', orgId: 'org_id', status: 'status', decidedAt: 'decided_at',
    manterTransactionId: 'manter_transaction_id', duplicataTransactionId: 'duplicata_transaction_id',
  },
}))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
}))

const { aprovarDuplicata, recusarDuplicata } = await import('@/lib/finance/duplicata-actions')

const PROPOSTA = { id: 'prop-1', duplicataTransactionId: 'tx-dup' }
const DUPLICATA_NO_SALDO = {
  id: 'tx-dup', accountId: 'acc-1', amountCents: -1168540, balanceApplied: true, isIgnored: false,
}

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('aprovarDuplicata', () => {
  it('marca a duplicata como ignorada e estorna o saldo', async () => {
    selectQueue.push([PROPOSTA], [DUPLICATA_NO_SALDO])

    const r = await aprovarDuplicata('prop-1')

    expect(r.efetivada).toBe(true)
    const emTransactions = ops.find((o) => o.op === 'update:transactions')
    expect(emTransactions?.payload).toEqual({ isIgnored: true })
    expect(ops.some((o) => o.op === 'update:accounts')).toBe(true)
    expect(ops.find((o) => o.op === 'update:duplicate_proposals')?.payload?.status).toBe('approved')
  })

  it('não estorna saldo de lançamento que nunca entrou nele', async () => {
    // Agendado do Open Finance entra com `balance_applied = false`. Estornar
    // aqui devolveria dinheiro que nunca foi debitado.
    selectQueue.push([PROPOSTA], [{ ...DUPLICATA_NO_SALDO, balanceApplied: false }])

    const r = await aprovarDuplicata('prop-1')

    expect(r.efetivada).toBe(true)
    expect(ops.some((o) => o.op === 'update:accounts')).toBe(false)
  })

  it('não faz nada quando a duplicata já foi ignorada por outro caminho', async () => {
    // Dois cliques, duas abas, ou o usuario ignorou na mao antes de aprovar.
    // Sem esta guarda o saldo seria estornado duas vezes.
    selectQueue.push([PROPOSTA], [{ ...DUPLICATA_NO_SALDO, isIgnored: true }])

    const r = await aprovarDuplicata('prop-1')

    expect(r.efetivada).toBe(false)
    expect(ops.some((o) => o.op === 'update:accounts')).toBe(false)
    expect(ops.some((o) => o.op === 'update:transactions')).toBe(false)
  })

  it('não faz nada quando a proposta não está mais pendente', async () => {
    selectQueue.push([])

    const r = await aprovarDuplicata('prop-1')

    expect(r.efetivada).toBe(false)
    expect(ops.some((o) => o.op.startsWith('update:'))).toBe(false)
  })
})

describe('recusarDuplicata', () => {
  it('marca a proposta como recusada sem tocar nos lançamentos', async () => {
    const r = await recusarDuplicata('prop-1')

    expect(r.recusada).toBe(true)
    expect(ops.find((o) => o.op === 'update:duplicate_proposals')?.payload?.status).toBe('refused')
    expect(ops.some((o) => o.op === 'update:transactions')).toBe(false)
    expect(ops.some((o) => o.op === 'update:accounts')).toBe(false)
  })
})
