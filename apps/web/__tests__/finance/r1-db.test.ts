import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const absorver = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/finance/conciliacao/absorver', () => ({ absorverNoBanco: (...a: unknown[]) => absorver(...a) }))

const selectQueue: unknown[][] = []
const wheres: SQL[] = []
const propostas: Record<string, unknown>[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  return c
}
const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: Record<string, unknown>) => { propostas.push(v); return chain([{ id: 'p' }]) } }),
}

const { aplicarR1 } = await import('@/lib/finance/conciliacao/r1-db')
const dialect = new PgDialect()

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)

beforeEach(() => { selectQueue.length = 0; wheres.length = 0; propostas.length = 0; absorver.mockClear() })

describe('aplicarR1', () => {
  it('par único: absorve; sem propostas', async () => {
    selectQueue.push(
      [{ id: 'perna-18', amountCents: 20000, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ id: 'ext-18', amountCents: 20000, date: d('2026-09-18'), counterpartyTaxId: '33076492802' }],
      [],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(absorver).toHaveBeenCalledWith(db, 'org-1', { aguardandoId: 'perna-18', extratoId: 'ext-18' })
    expect(r).toEqual({ absorvidas: [{ aguardandoId: 'perna-18', extratoId: 'ext-18' }], propostas: 0 })
  })

  it('ambíguo: grava uma proposta pendente e não absorve', async () => {
    selectQueue.push(
      [{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [
        { id: 'e1', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null },
        { id: 'e2', amountCents: 500, date: d('2026-09-19'), counterpartyTaxId: null },
      ],
      [],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(absorver).not.toHaveBeenCalled()
    expect(propostas).toEqual([{ orgId: 'org-1', forecastTransactionId: 'a', realizedTransactionId: 'e1', status: 'pending' }])
    expect(r.propostas).toBe(1)
  })

  it('par recusado não volta', async () => {
    selectQueue.push(
      [{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ id: 'e', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }],
      [{ forecastTransactionId: 'a', realizedTransactionId: 'e' }],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r).toEqual({ absorvidas: [], propostas: 0 })
  })

  it('aguardando com proposta aberta e extrato já vinculado ou com proposta pendente ficam de fora', async () => {
    selectQueue.push([{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null }], [])
    await aplicarR1(db, 'org-1', 'nubank')
    const aguardando = dialect.sqlToQuery(wheres[0]).sql.toLowerCase()
    const extrato = dialect.sqlToQuery(wheres[1]).sql.toLowerCase()
    expect(aguardando).toContain('"aguarda_extrato" = ')
    expect(aguardando).toContain('forecast_transaction_id')
    expect(extrato).toContain('"origem" = ')
    expect(extrato).toContain('matched_transaction_id')
    expect(extrato).toContain('realized_transaction_id')
  })

  it('nada aguardando: não consulta o extrato', async () => {
    selectQueue.push([])
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r).toEqual({ absorvidas: [], propostas: 0 })
    expect(wheres).toHaveLength(1)
  })
})
