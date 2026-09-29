import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName, type SQL } from 'drizzle-orm'

const wheres: SQL[] = []
const selectQueue: unknown[][] = []
// Cada UPDATE: a tabela, o SET e o WHERE, na ordem em que foram emitidos.
const updates: { tabela: string; set: any; where: SQL | undefined }[] = []
// O que o UPDATE de transactions devolve em `returning`.
let aplicadas: unknown[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  c.from = () => c
  c.limit = () => c
  c.where = (cond: SQL) => { wheres.push(cond); return c }
  return c
}

function update(t: any): any {
  const u = { tabela: getTableName(t), set: undefined as any, where: undefined as SQL | undefined }
  updates.push(u)
  const result = u.tabela === 'transactions' ? aplicadas : []
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  c.set = (s: unknown) => { u.set = s; return c }
  c.where = (cond: SQL) => { u.where = cond; return c }
  c.returning = () => c
  return c
}

const api = { select: () => chain(selectQueue.shift() ?? []), update }

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({ ...api, transaction: async (fn: (tx: unknown) => unknown) => fn(api) }) }
})
vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateTransactionData: vi.fn(), revalidateSnapshotData: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({ accountsTag: vi.fn(), investmentsTag: vi.fn(), invalidateTag: vi.fn() }))

const { applyDueBankTransactions } = await import('@/lib/finance/apply-due')
const dialect = new PgDialect()

beforeEach(() => {
  wheres.length = 0; selectQueue.length = 0; updates.length = 0; aplicadas = []
})

describe('applyDueBankTransactions', () => {
  it('exclui a perna prevista de transferência: ela nunca entra no saldo por data', async () => {
    await applyDueBankTransactions()
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('not like')
    expect(q.params).toContain('%:transfer-par')
  })

  it('exclui a linha que aguarda o extrato: :transfer-dest reclassificada tem external_id e não pode voltar ao saldo', async () => {
    await applyDueBankTransactions()
    const q = dialect.sqlToQuery(wheres[0])
    expect(q.sql).toContain('"aguarda_extrato" = ')
  })

  // As linhas são lidas fora da transação. Se `reclassificarConta` marcar uma
  // delas como aguardando nesse meio-tempo, o UPDATE final não pode aplicá-la
  // — nem o saldo da conta pode receber o valor dela.
  it('o UPDATE final re-checa aguarda_extrato e só soma no saldo o que ele de fato aplicou', async () => {
    selectQueue.push(
      [{ id: 't1' }],
      [{ id: 't1', accountId: 'itau', amountCents: 100 }, { id: 't2', accountId: 'itau', amountCents: 50 }],
    )
    aplicadas = [{ id: 't1', accountId: 'itau', amountCents: 100 }] // t2 virou aguardando no meio

    await applyDueBankTransactions()

    const txUpdate = updates.find((u) => u.tabela === 'transactions')!
    const q = dialect.sqlToQuery(txUpdate.where!)
    expect(q.sql).toContain('"aguarda_extrato" = ')
    expect(q.sql).toContain('"balance_applied" = ')

    const contaUpdate = updates.find((u) => u.tabela === 'accounts')!
    const saldo = dialect.sqlToQuery(contaUpdate.set.balanceCents)
    expect(saldo.params).toContain(100)
    expect(saldo.params).not.toContain(150)
  })

  it('nada aplicado no UPDATE final: o saldo das contas não é tocado', async () => {
    selectQueue.push([{ id: 't1' }], [{ id: 't1', accountId: 'itau', amountCents: 100 }])
    aplicadas = []

    await applyDueBankTransactions()

    expect(updates.map((u) => u.tabela)).toEqual(['transactions'])
  })
})
