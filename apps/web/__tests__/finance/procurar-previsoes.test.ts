import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { interpretarTermo } from '@/lib/finance/conciliacao/termo-de-busca'

/**
 * "Procurar previsão" (spec §2.4): o termo vira valor só quando parece
 * dinheiro em pt-BR, e a busca só devolve previsões que o servidor aceitaria
 * vincular (mesmo sinal; perna que aguarda extrato só da própria conta).
 * As tabelas são as reais, para o WHERE poder ser renderizado em SQL.
 */

describe('interpretarTermo', () => {
  it.each([
    ['1.500,00', 150000, null],
    ['15,9', 1590, null],
    ['1.234.567', 123456700, null],
    // Só dígitos: pode ser valor ou parte da descrição ("2024", "99").
    ['2024', 202400, '2024'],
    ['150,50', 15050, null],
  ])('"%s" → %s centavos, texto %s', (termo, centavos, texto) => {
    expect(interpretarTermo(termo)).toEqual({ centavos, texto })
  })
  it.each([
    ['aluguel', 'aluguel'],
    ['1,5,6', '1,5,6'],
    ['12.34', '12.34'],
    ['1e5', '1e5'],
    ['Infinity', 'Infinity'],
    ['NETFLIX 12', 'NETFLIX 12'],
  ])('"%s" não é valor: busca na descrição', (termo, texto) => {
    expect(interpretarTermo(termo)).toEqual({ centavos: null, texto })
  })
  it('acima do teto de centavos ou zero não vira valor', () => {
    expect(interpretarTermo('99999999999')).toEqual({ centavos: null, texto: '99999999999' })
    expect(interpretarTermo('20.000.001')).toEqual({ centavos: null, texto: '20.000.001' })
    expect(interpretarTermo('00')).toEqual({ centavos: null, texto: '00' })
  })
  it('apara espaços', () => {
    expect(interpretarTermo('  aluguel ')).toEqual({ centavos: null, texto: 'aluguel' })
  })
})

const wheres: SQL[] = []
const selectQueue: unknown[][] = []

function chain(result: unknown[]): any {
  const c: any = { then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r) }
  for (const m of ['from', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) c[m] = () => c
  c.where = (cond: SQL) => { wheres.push(cond); return c }
  return c
}
const api = { select: () => chain(selectQueue.shift() ?? []) }

vi.mock('@/lib/finance/queries', () => ({ getOrgId: async () => 'org-1' }))
vi.mock('@/lib/finance/revalidate', () => ({ revalidateTransactionData: vi.fn(), revalidateSnapshotData: vi.fn() }))
vi.mock('@/lib/cache-tags', () => ({ accountsTag: vi.fn(), invalidateTag: vi.fn() }))
vi.mock('@/lib/db/rls', () => ({ withUserDb: async (fn: (db: unknown) => unknown) => fn(api) }))

const { procurarPrevisoes } = await import('@/lib/finance/conciliacao/vincular-actions')
const dialect = new PgDialect()

beforeEach(() => {
  wheres.length = 0
  selectQueue.length = 0
})

async function whereDaBusca(termo: string) {
  selectQueue.push([{ accountId: 'itau', date: '2026-09-12', amountCents: -15000 }], [])
  await procurarPrevisoes('real-1', termo)
  return dialect.sqlToQuery(wheres[1])
}

describe('procurarPrevisoes', () => {
  it('só previsões de mesmo sinal que o realizado', async () => {
    const q = await whereDaBusca('aluguel')
    expect(q.sql).toContain('sign("transactions"."amount_cents") = ')
    expect(q.params).toContain(-1)
  })
  it('perna que aguarda extrato só aparece se for da conta do realizado', async () => {
    const q = await whereDaBusca('aluguel')
    expect(q.sql).toMatch(/\("transactions"\."aguarda_extrato" = \$\d+ or "transactions"\."account_id" = \$\d+\)/)
    expect(q.params).toContain('itau')
  })
  it('valor com separador busca só pelo valor', async () => {
    const q = await whereDaBusca('150,00')
    expect(q.sql).toContain('abs("transactions"."amount_cents") = ')
    expect(q.sql).not.toContain('ilike')
    expect(q.params).toContain(15000)
  })
  it('só dígitos busca por valor OU descrição', async () => {
    const q = await whereDaBusca('2024')
    expect(q.sql).toMatch(/\(abs\("transactions"\."amount_cents"\) = \$\d+ or "transactions"\."description" ilike \$\d+\)/)
    expect(q.params).toEqual(expect.arrayContaining([202400, '%2024%']))
  })
  it('texto busca só na descrição', async () => {
    const q = await whereDaBusca('12.34')
    expect(q.sql).toContain('ilike')
    expect(q.sql).not.toContain('abs(')
  })
})
