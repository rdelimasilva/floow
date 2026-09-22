import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O sync para de decidir. Antes ele gravava `matched_transaction_id` direto:
 * previsão declarada cumprida sem ninguém olhar, e casar errado esconde um
 * lançamento de verdade. Agora insere PROPOSTA e quem efetiva é o usuário.
 *
 * `onConflictDoNothing` cobre os dois casos que não devem virar erro: o par já
 * recusado (barrado pelo único em (previsão, realizado)) e a previsão que já
 * tem proposta aberta.
 */

const ops: { op: string; payload?: unknown; table?: string }[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[], atual: { op: string; payload?: unknown }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit', 'returning', 'onConflictDoNothing', 'leftJoin']) {
    c[m] = () => chain(result, atual)
  }
  c.set = (payload: unknown) => { atual.payload = payload; return chain(result, atual) }
  c.values = (payload: unknown) => { atual.payload = payload; return chain(result, atual) }
  return c
}

const db = {
  select: () => { const op = { op: 'select' }; ops.push(op); return chain(selectQueue.shift() ?? [], op) },
  insert: (table: unknown) => {
    const op = { op: 'insert', table: (table as { _?: { name?: string } })?._?.name }
    ops.push(op)
    return chain([{ id: 'prop-1' }], op)
  },
  update: () => { const op = { op: 'update' }; ops.push(op); return chain([], op) },
} as never

vi.mock('@floow/db', () => ({
  getDb: () => db,
  transactions: { _: { name: 'transactions' }, id: 'id', orgId: 'org_id', accountId: 'account_id', amountCents: 'amount_cents', date: 'date', description: 'description', externalId: 'external_id', recurringTemplateId: 'recurring_template_id', balanceApplied: 'balance_applied', matchedTransactionId: 'matched_transaction_id', isIgnored: 'is_ignored' },
  forecastMatchProposals: { _: { name: 'forecast_match_proposals' }, forecastTransactionId: 'forecast_transaction_id', realizedTransactionId: 'realized_transaction_id', orgId: 'org_id', status: 'status' },
}))

const { criarPropostasDeConciliacao } = await import('@/lib/finance/forecast-match-db')

const PREVISTO = { id: 'prev-1', amountCents: -120000, date: new Date('2026-09-01'), description: 'Aluguel' }
const REALIZADO = { id: 'real-1', amountCents: -120000, date: new Date('2026-09-03'), description: 'Pagamento de boleto HANNI DAVID' }

beforeEach(() => {
  ops.length = 0
  selectQueue.length = 0
})

describe('criarPropostasDeConciliacao', () => {
  it('insere proposta para o par que o casamento escolhe', async () => {
    selectQueue.push([PREVISTO], [REALIZADO])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(1)
    const insert = ops.find((o) => o.op === 'insert')
    expect(insert?.table).toBe('forecast_match_proposals')
    expect(insert?.payload).toMatchObject({
      orgId: 'org-1',
      forecastTransactionId: 'prev-1',
      realizedTransactionId: 'real-1',
      status: 'pending',
    })
  })

  it('NUNCA grava o vínculo — quem efetiva é o usuário', async () => {
    selectQueue.push([PREVISTO], [REALIZADO])

    await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('sem previsão aberta, não consulta realizado nem insere', async () => {
    selectQueue.push([])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(0)
    expect(ops.filter((o) => o.op === 'select')).toHaveLength(1)
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })

  it('valor fora de tolerância não vira proposta', async () => {
    selectQueue.push([PREVISTO], [{ ...REALIZADO, amountCents: -500000 }])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(0)
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })

  it('duas previsões não reivindicam o mesmo realizado na mesma rodada', async () => {
    selectQueue.push([PREVISTO, { ...PREVISTO, id: 'prev-2' }], [REALIZADO])

    const criadas = await criarPropostasDeConciliacao(db, 'org-1', 'conta-1')

    expect(criadas).toBe(1)
  })
})
