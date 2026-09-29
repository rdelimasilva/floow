import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const absorver = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/finance/conciliacao/absorver', () => ({ absorverNoBanco: (...a: unknown[]) => absorver(...a) }))

const selectQueue: unknown[][] = []
const wheres: SQL[] = []
const joins: SQL[] = []
const propostas: Record<string, unknown>[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); return c }
  c.leftJoin = (_t: unknown, on: SQL) => { joins.push(on); return c }
  return c
}
const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => ({ values: (v: Record<string, unknown>) => { propostas.push(v); return chain([{ id: 'p' }]) } }),
}

const { aplicarR1 } = await import('@/lib/finance/conciliacao/r1-db')
const { buscarProvisorias } = await import('@/lib/finance/conciliacao/r1-candidatos')
const dialect = new PgDialect()

const d = (iso: string) => new Date(`${iso}T12:00:00Z`)

beforeEach(() => { selectQueue.length = 0; wheres.length = 0; joins.length = 0; propostas.length = 0; absorver.mockClear() })

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

  it('extrato com grupo fica de fora (P11), salvo no espelho: parceiro é perna que aguarda noutra conta', async () => {
    selectQueue.push([{ id: 'a', amountCents: 500, date: d('2026-09-18'), counterpartyTaxId: null, espelho: null }], [])
    await aplicarR1(db, 'org-1', 'nubank')
    expect(dialect.sqlToQuery(wheres[1]).sql.toLowerCase())
      .toContain('("transactions"."transfer_group_id" is null or "parceiro"."id" is not null)')
    const juncao = dialect.sqlToQuery(joins[1])
    expect(juncao.sql).toContain('"parceiro"."transfer_group_id" = "transactions"."transfer_group_id"')
    expect(juncao.sql).toContain('"parceiro"."aguarda_extrato" = $')
    expect(juncao.sql).toContain('"parceiro"."account_id" <> "transactions"."account_id"')
    expect(juncao.params).toEqual(['perna', true])
  })

  it('perna aguardando: o espelho é a conta do extrato parceiro no grupo dela', async () => {
    selectQueue.push([])
    await aplicarR1(db, 'org-1', 'nubank')
    const juncao = dialect.sqlToQuery(joins[0])
    expect(juncao.sql).toContain('"parceiro"."account_id" <> "transactions"."account_id"')
    expect(juncao.params).toEqual(['perna', 'extrato'])
  })

  it('espelho OF↔OF: o extrato de G2 absorve a perna de G1 que aponta para a mesma conta', async () => {
    selectQueue.push(
      [{ id: 'perna-g1', amountCents: 12300, date: d('2026-09-01'), counterpartyTaxId: null, espelho: 'itau' }],
      [{ id: 'ext-g2', amountCents: 12300, date: d('2026-09-01'), counterpartyTaxId: null, espelho: 'itau' }],
      [],
    )
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r.absorvidas).toEqual([{ aguardandoId: 'perna-g1', extratoId: 'ext-g2' }])
  })

  it('extrato com grupo não absorve provisória sem o mesmo espelho', async () => {
    selectQueue.push(
      [{ id: 'manual', amountCents: 12300, date: d('2026-09-01'), counterpartyTaxId: null, espelho: null }],
      [{ id: 'ext-g2', amountCents: 12300, date: d('2026-09-01'), counterpartyTaxId: null, espelho: 'itau' }],
      [],
    )
    expect(await aplicarR1(db, 'org-1', 'nubank')).toEqual({ absorvidas: [], propostas: 0 })
  })

  it('nada aguardando: não consulta o extrato', async () => {
    selectQueue.push([])
    const r = await aplicarR1(db, 'org-1', 'nubank')
    expect(r).toEqual({ absorvidas: [], propostas: 0 })
    expect(wheres).toHaveLength(1)
  })
})

describe('buscarProvisorias — legado (candidatas de reclassificarConta)', () => {
  it('só manual/arquivo/perna ainda fora da marca, a partir do corte, sem vínculo, não ignoradas, sem proposta aberta', async () => {
    selectQueue.push([])
    await buscarProvisorias(db, 'org-1', 'nubank', { legadoDesde: '2026-01-01' })
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"transactions"."aguarda_extrato" = $')
    expect(q.sql).toContain('"transactions"."origem" in ($')
    expect(q.sql).toContain('"transactions"."date" >= $7::date')
    expect(q.sql).toContain('"transactions"."matched_transaction_id" is null')
    expect(q.sql).toContain('forecast_transaction_id')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'nubank', false, 'manual', 'arquivo', 'perna', '2026-01-01']))
  })
})
