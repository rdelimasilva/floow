import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * O previsto que já foi casado com o realizado nunca pode entrar no saldo.
 *
 * Sem isto o casamento não resolve nada: `reconcileRecurringBalances` continua
 * aplicando o valor previsto quando a data chega, e o realizado que o sync
 * importou soma por cima — a dupla contagem que a feature existe para matar.
 *
 * O teste prende o SQL gerado, porque o filtro roda no Postgres e o valor de
 * retorno da função não revela quais linhas ela considerou.
 */

const selectQueue: unknown[][] = []
const sqlCapturado: string[] = []
const dialect = new PgDialect()

function chain(result: unknown[]): any {
  const c: any = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    getSQL: () => undefined,
  }
  for (const m of ['from', 'limit', 'returning', 'orderBy', 'set', 'values']) c[m] = () => chain(result)
  c.where = (cond: unknown) => {
    try {
      sqlCapturado.push(dialect.sqlToQuery(cond as never).sql)
    } catch {
      // Condicao que o dialeto nao serializa isolada: nao interessa aqui.
    }
    return chain(result)
  }
  return c
}

const api = {
  select: () => chain(selectQueue.shift() ?? []),
  insert: () => chain([]),
  update: () => chain([]),
  delete: () => chain([]),
}

const mockDb = { ...api, transaction: async (fn: (tx: unknown) => unknown) => fn(api) }

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => mockDb }
})

vi.mock('@/lib/finance/queries', () => ({
  getOrgId: () => Promise.resolve('org-1'),
  getCategoryRules: () => Promise.resolve([]),
}))
vi.mock('@/lib/investments/queries', () => ({ getPositions: () => Promise.resolve([]) }))
vi.mock('@/lib/cfo/trigger', () => ({ triggerCfoAnalysis: vi.fn() }))
vi.mock('next/cache', () => ({ unstable_cache: (f: unknown) => f, revalidateTag: vi.fn() }))
vi.mock('@/lib/finance/revalidate', () => ({
  revalidateTransactionData: vi.fn(),
  revalidateAccountData: vi.fn(),
  revalidateSnapshotData: vi.fn(),
  revalidateCategoryData: vi.fn(),
}))

const { reconcileRecurringBalances } = await import('@/lib/finance/actions')

beforeEach(() => {
  selectQueue.length = 0
  sqlCapturado.length = 0
})

describe('reconcileRecurringBalances', () => {
  it('ignora previsto que já tem vínculo com o realizado', async () => {
    // Curto-circuito: sem pendente a funcao retorna antes de tudo, e o SQL do
    // curto-circuito e justamente o que precisa ter o filtro.
    selectQueue.push([])

    await reconcileRecurringBalances()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"matched_transaction_id" is null')
  })

  it('mantém os filtros que já existiam — balance_applied e a data', async () => {
    selectQueue.push([])

    await reconcileRecurringBalances()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"balance_applied" =')
    expect(query).toContain('<=')
  })
})
