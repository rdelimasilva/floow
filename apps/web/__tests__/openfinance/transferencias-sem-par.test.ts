import { beforeEach, describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

/**
 * Rotina direcionada do backfill: transferência do banco sem par e sem conta
 * volta para Classificar — com contraparte, senão a fila não a mostra. Nunca
 * confirma nada: quem decide a conta é o usuário.
 */

const selectQueue: unknown[][] = []
const inserts: any[] = []
const updates: Array<{ set?: Record<string, unknown>; where?: SQL }> = []
const wheres: SQL[] = []

function chain(result: unknown[], op?: { set?: Record<string, unknown>; where?: SQL }): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'onConflictDoNothing', 'returning']) c[m] = () => c
  c.where = (w: SQL) => { wheres.push(w); if (op) op.where = w; return c }
  c.set = (p: Record<string, unknown>) => { if (op) op.set = p; return c }
  return c
}

const db: any = {
  select: () => chain(selectQueue.shift() ?? []),
  update: () => { const op = {}; updates.push(op); return chain([{ id: 'ok' }], op) },
  insert: () => ({
    values: (v: any) => {
      inserts.push(v)
      return chain([{ id: 'cp-nova', ...v, nature: null, categoryId: null, transferAccountId: null, confirmedAt: null }])
    },
  }),
}

const { devolverTransferenciasSemParAClassificar } = await import('@/lib/openfinance/transferencias-sem-par')

const dialect = new PgDialect()

const linha = (over: Record<string, unknown> = {}) => ({
  id: 'tx-1', accountId: 'itau', amountCents: -50000, description: 'APLICACAO CDB 12/08',
  counterpartyTaxId: null, counterpartyName: null, counterpartyId: null, ...over,
})

beforeEach(() => {
  selectQueue.length = 0
  inserts.length = 0
  updates.length = 0
  wheres.length = 0
})

describe('devolverTransferenciasSemParAClassificar', () => {
  it('só pega transferência do banco sem grupo, sem conta, sem vínculo e que não é perna prevista', async () => {
    selectQueue.push([])
    const r = await devolverTransferenciasSemParAClassificar(db, 'org-1')

    expect(r).toEqual({ devolvidas: 0, semChave: 0 })
    const q = dialect.sqlToQuery(wheres[0])
    const s = q.sql.toLowerCase()
    expect(s).toContain('"transfer_group_id" is null')
    expect(s).toContain('"transfer_account_id" is null')
    expect(s).toContain('"external_id" is not null')
    expect(s).toContain('"matched_transaction_id" = "transactions"."id"')
    expect(s).toContain('not like')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'transfer', '%:transfer-par']))
  })

  it('sem contraparte: cria a contraparte pelos dados gravados e devolve pendente com ela', async () => {
    selectQueue.push([linha()])
    selectQueue.push([]) // loadCounterpartyIndex: nenhuma contraparte ainda

    const r = await devolverTransferenciasSemParAClassificar(db, 'org-1')

    expect(r.devolvidas).toBe(1)
    expect(inserts[0]).toMatchObject({
      orgId: 'org-1', keyType: 'description', keyValue: 'APLICACAO CDB', direction: 'out', accountId: 'itau',
      displayName: 'APLICACAO CDB 12/08',
    })
    expect(updates[0].set).toEqual({ counterpartyId: 'cp-nova', reviewState: 'pending' })
  })

  it('contraparte já existente no índice é reaproveitada, sem insert', async () => {
    selectQueue.push([linha({ counterpartyTaxId: '12345678000199', counterpartyName: 'CORRETORA' })])
    selectQueue.push([{
      id: 'cp-velha', orgId: 'org-1', keyType: 'tax_id', keyValue: '12345678000199', direction: 'out', accountId: null,
      nature: 'transfer', categoryId: null, transferAccountId: null, confirmedAt: new Date(),
    }])

    await devolverTransferenciasSemParAClassificar(db, 'org-1')

    expect(inserts).toEqual([])
    expect(updates[0].set).toEqual({ counterpartyId: 'cp-velha', reviewState: 'pending' })
  })

  it('linha que já tem contraparte só volta a pendente — nunca confirmada', async () => {
    selectQueue.push([linha({ counterpartyId: 'cp-1' })])

    const r = await devolverTransferenciasSemParAClassificar(db, 'org-1')

    expect(r.devolvidas).toBe(1)
    expect(updates[0].set).toEqual({ counterpartyId: 'cp-1', reviewState: 'pending' })
    // O UPDATE repete o recorte: se a linha ganhou par entre a leitura e aqui, fica.
    const s = dialect.sqlToQuery(updates[0].where!).sql.toLowerCase()
    expect(s).toContain('"transfer_group_id" is null')
    expect(s).toContain('"transfer_account_id" is null')
  })

  it('sem chave de contraparte: não mexe (pendente sem contraparte some de Classificar)', async () => {
    selectQueue.push([linha({ description: '12/08 1234' })])
    selectQueue.push([])

    const r = await devolverTransferenciasSemParAClassificar(db, 'org-1')

    expect(r).toEqual({ devolvidas: 0, semChave: 1 })
    expect(updates).toEqual([])
  })
})
