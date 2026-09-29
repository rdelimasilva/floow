import { describe, it, expect, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName, type SQL } from 'drizzle-orm'
import { inicioDoExtrato, reclassificarConta } from '@/lib/finance/conciliacao/reclassificar-conta'

const dialect = new PgDialect()
let linhasAfetadas: unknown[] = []
let selectResult: unknown[] = []
const executados: SQL[] = []
const updates: { tabela: string; payload: Record<string, unknown> }[] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  return c
}
const db: any = {
  execute: async (q: SQL) => { executados.push(q); return linhasAfetadas },
  select: () => chain(selectResult),
  update: (t: any) => ({
    set: (payload: Record<string, unknown>) => { updates.push({ tabela: getTableName(t), payload }); return chain([]) },
  }),
}

beforeEach(() => { linhasAfetadas = []; selectResult = []; executados.length = 0; updates.length = 0 })

describe('reclassificarConta', () => {
  it('caso de 28/09: as duas :transfer-dest passam a aguardar e estornam R$ 323,00', async () => {
    linhasAfetadas = [
      { id: 'perna-18', amount_cents: 20000, no_saldo: true },
      { id: 'perna-01', amount_cents: 12300, no_saldo: true },
    ]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 2, estornoCents: 32300 })
    expect(updates).toHaveLength(1)
    expect(updates[0].tabela).toBe('accounts')
    expect(dialect.sqlToQuery(updates[0].payload.balanceCents as SQL).params).toContain(32300)
  })

  it('só toca manual/arquivo/perna ainda fora da marca, a partir do corte, travando as linhas', async () => {
    await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    const q = dialect.sqlToQuery(executados[0])
    expect(q.sql).toContain('"aguarda_extrato" = false')
    expect(q.sql).toContain('for update')
    expect(q.sql).toContain('set aguarda_extrato = true, balance_applied = false')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'nubank', '2026-01-01', 'manual', 'arquivo', 'perna']))
  })

  it('linha ignorada ou futura (fora do saldo) muda de marca mas não estorna', async () => {
    linhasAfetadas = [{ id: 'x', amount_cents: 5000, no_saldo: false }]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 1, estornoCents: 0 })
    expect(updates).toEqual([])
  })

  it('rodar de novo sem nada a reclassificar não mexe em saldo', async () => {
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 0, estornoCents: 0 })
    expect(updates).toEqual([])
  })
})

describe('inicioDoExtrato', () => {
  it('usa o sync_from_date quando o recurso tem', async () => {
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', '2026-01-01')).toBe('2026-01-01')
  })

  it('sem sync_from_date, a primeira linha do extrato da conta', async () => {
    selectResult = [{ inicio: '2025-10-03' }]
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', null)).toBe('2025-10-03')
  })

  it('sem corte e sem extrato ainda: não reclassifica nada', async () => {
    selectResult = [{ inicio: null }]
    expect(await inicioDoExtrato(db, 'org-1', 'nubank', null)).toBeNull()
  })
})
