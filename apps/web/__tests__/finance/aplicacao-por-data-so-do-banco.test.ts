import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * Aplicar saldo quando a data chega é legítimo — para o lançamento do BANCO.
 *
 * Lançamento agendado ou de data futura vindo do Open Finance entra com
 * `balance_applied = false` (`sync.ts:353`) e o caminho de update do sync não
 * mexe nesse campo de propósito. Alguém precisa aplicá-lo quando o dia
 * chega, senão ele nunca entra no saldo.
 *
 * O que NÃO pode ser aplicado por data é a previsão de template. Era isso que
 * `reconcileRecurringBalances` fazia sem distinguir: punha a estimativa no
 * saldo e, de quebra, tirava a linha da fila de casamento — por isso a
 * conciliação só funcionava com extrato adiantado.
 *
 * O teste prende o SQL porque o filtro roda no Postgres: o valor de retorno
 * da função não revela quais linhas ela considerou.
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
  revalidateInvestmentData: vi.fn(),
}))

const { applyDueBankTransactions } = await import('@/lib/finance/apply-due')

beforeEach(() => {
  selectQueue.length = 0
  sqlCapturado.length = 0
})

describe('applyDueBankTransactions', () => {
  it('só considera lançamento que veio do banco', async () => {
    // Curto-circuito: sem pendente a funcao retorna cedo, e o SQL do
    // curto-circuito e justamente onde o filtro precisa estar.
    selectQueue.push([])

    await applyDueBankTransactions()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"external_id" is not null')
  })

  it('nunca aplica previsão de template por data', async () => {
    selectQueue.push([])

    await applyDueBankTransactions()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"recurring_template_id" is null')
  })

  it('mantém os filtros de pendência e de data', async () => {
    selectQueue.push([])

    await applyDueBankTransactions()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"balance_applied" =')
    expect(query).toContain('<=')
  })
})

/**
 * Lancamento agendado entra do Open Finance com `is_ignored = true` e
 * `balance_applied = false` (`sync.ts:386`) — visivel para o usuario, fora das
 * somas, "senao vira gasto que ninguem fez". Sem este filtro, quando a data
 * chegava o saldo o aplicava assim mesmo e o lancamento virava exatamente isso:
 * pesava no saldo continuando marcado como ignorado, invisivel para todo
 * relatorio que filtra `is_ignored`. Na conta real isso deixou R$ 256,55 de
 * conta de luz dentro do saldo do Itau.
 */
describe('applyDueBankTransactions e o lançamento ignorado', () => {
  it('não aplica no saldo lançamento marcado como ignorado', async () => {
    selectQueue.push([])

    await applyDueBankTransactions()

    const query = sqlCapturado.join(' | ').toLowerCase()
    expect(query).toContain('"is_ignored" =')
  })
})
