import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName, type SQL } from 'drizzle-orm'
import type { LinhaParaConciliar, ParConciliado } from '@floow/core-finance'

/**
 * O legado só sai do saldo com prova (Ruling P12): par único no extrato pela
 * regra do R1. Os candidatos e a regra (`r1-candidatos.ts`) são simulados
 * aqui; o SQL deles é testado em `r1-db.test.ts`.
 */
let legado: LinhaParaConciliar[] = []
let aguardando: LinhaParaConciliar[] = []
let pares: { absorver: ParConciliado[]; propor: ParConciliado[] } = { absorver: [], propor: [] }
const poolDoR1: LinhaParaConciliar[][] = []

vi.mock('@/lib/finance/conciliacao/r1-candidatos', () => ({
  buscarProvisorias: vi.fn(async (_db: unknown, _o: string, _c: string, alvo?: { legadoDesde?: string }) => (alvo?.legadoDesde ? legado : aguardando)),
  paresDoR1: vi.fn(async (_db: unknown, _o: string, _c: string, pool: LinhaParaConciliar[]) => { poolDoR1.push(pool); return pares }),
}))

const { inicioDoExtrato, reclassificarConta } = await import('@/lib/finance/conciliacao/reclassificar-conta')

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

const linha = (id: string, amountCents: number): LinhaParaConciliar => ({ id, amountCents, dateISO: '2026-09-01', counterpartyTaxId: null })

beforeEach(() => {
  legado = []; aguardando = []; pares = { absorver: [], propor: [] }; poolDoR1.length = 0
  linhasAfetadas = []; selectResult = []; executados.length = 0; updates.length = 0
})

describe('reclassificarConta', () => {
  it('caso de 28/09: as duas :transfer-dest com par único passam a aguardar e estornam R$ 323,00', async () => {
    legado = [linha('perna-18', 20000), linha('perna-01', 12300)]
    pares = { absorver: [{ aguardandoId: 'perna-01', extratoId: 'ext-01' }, { aguardandoId: 'perna-18', extratoId: 'ext-18' }], propor: [] }
    linhasAfetadas = [
      { id: 'perna-18', amount_cents: 20000, no_saldo: true },
      { id: 'perna-01', amount_cents: 12300, no_saldo: true },
    ]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    expect(r).toEqual({ reclassificadas: 2, estornoCents: 32300 })
    expect(dialect.sqlToQuery(executados[0]).params).toEqual(expect.arrayContaining(['perna-01', 'perna-18']))
    expect(updates).toHaveLength(1)
    expect(updates[0].tabela).toBe('accounts')
    expect(dialect.sqlToQuery(updates[0].payload.balanceCents as SQL).params).toContain(32300)
  })

  it('linha antiga sem par no extrato (R$ 500 de 06/04) não é tocada: fica no saldo', async () => {
    legado = [linha('perna-500', 50000), linha('perna-01', 12300)]
    pares = { absorver: [{ aguardandoId: 'perna-01', extratoId: 'ext-01' }], propor: [] }
    linhasAfetadas = [{ id: 'perna-01', amount_cents: 12300, no_saldo: true }]
    const r = await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    const params = dialect.sqlToQuery(executados[0]).params
    expect(params).toContain('perna-01')
    expect(params).not.toContain('perna-500')
    expect(r).toEqual({ reclassificadas: 1, estornoCents: 12300 })
  })

  it('par ambíguo (só proposta) não é prova: nada muda, nem SQL de escrita', async () => {
    legado = [linha('a', 500)]
    pares = { absorver: [], propor: [{ aguardandoId: 'a', extratoId: 'e1' }] }
    expect(await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')).toEqual({ reclassificadas: 0, estornoCents: 0 })
    expect(executados).toEqual([])
    expect(updates).toEqual([])
  })

  it('a unicidade conta também com o que já aguarda; par único de uma linha que já aguardava não reclassifica nada', async () => {
    legado = [linha('antiga', 500)]
    aguardando = [linha('nova', 500)]
    pares = { absorver: [{ aguardandoId: 'nova', extratoId: 'e' }], propor: [] }
    expect(await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')).toEqual({ reclassificadas: 0, estornoCents: 0 })
    expect(poolDoR1[0].map((l) => l.id)).toEqual(['nova', 'antiga'])
    expect(executados).toEqual([])
  })

  it('a escrita re-checa a marca, a origem e o corte, travando as linhas', async () => {
    legado = [linha('m', 500)]
    pares = { absorver: [{ aguardandoId: 'm', extratoId: 'e' }], propor: [] }
    await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')
    const q = dialect.sqlToQuery(executados[0])
    expect(q.sql).toContain('"aguarda_extrato" = false')
    expect(q.sql).toContain('for update')
    expect(q.sql).toContain('set aguarda_extrato = true, balance_applied = false')
    expect(q.params).toEqual(expect.arrayContaining(['org-1', 'nubank', '2026-01-01', 'manual', 'arquivo', 'perna', 'm']))
  })

  it('linha futura (fora do saldo) com prova muda de marca mas não estorna', async () => {
    legado = [linha('x', 5000)]
    pares = { absorver: [{ aguardandoId: 'x', extratoId: 'e' }], propor: [] }
    linhasAfetadas = [{ id: 'x', amount_cents: 5000, no_saldo: false }]
    expect(await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')).toEqual({ reclassificadas: 1, estornoCents: 0 })
    expect(updates).toEqual([])
  })

  it('nada antigo para reclassificar: não consulta o extrato nem mexe em saldo', async () => {
    expect(await reclassificarConta(db, 'org-1', 'nubank', '2026-01-01')).toEqual({ reclassificadas: 0, estornoCents: 0 })
    expect(poolDoR1).toEqual([])
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
