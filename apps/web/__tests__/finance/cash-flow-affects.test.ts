import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * O invariante: a agregação mensal de fluxo de caixa não conta lançamento cujo
 * `affects_cash_flow` efetivo é falso — o do próprio lançamento quando
 * preenchido, o da categoria quando o lançamento está `null`.
 *
 * A agregação é SQL cru (`db.execute(sql\`...\`)`), então o filtro roda no
 * Postgres e não há valor de retorno em JS para assertar. O que este teste
 * prende é o SQL gerado: sem o join em `categories` e sem o `coalesce` dos
 * dois lados, ele falha. Cobre a regressão de alguém remover a regra; não
 * cobre o Postgres avaliar o `coalesce` corretamente.
 */

const sqlCapturado: string[] = []
const dialect = new PgDialect()

const mockDb = {
  execute: (query: unknown) => {
    sqlCapturado.push(dialect.sqlToQuery(query as never).sql)
    return Promise.resolve([])
  },
}

vi.mock('@floow/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@floow/db')>()),
  getDb: () => mockDb,
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve({}) }))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: vi.fn(),
}))

const { getMonthlyCashFlowSummary, getFutureMonthlyCashFlowSummary } = await import(
  '@/lib/finance/queries'
)

/** Normaliza espaços para as asserções não dependerem da indentação do template. */
function normalizado(texto: string): string {
  return texto.replace(/\s+/g, ' ').toLowerCase()
}

beforeEach(() => {
  sqlCapturado.length = 0
})

describe('agregação mensal de fluxo de caixa', () => {
  it('resolve o affects_cash_flow efetivo com coalesce entre lançamento e categoria', async () => {
    await getMonthlyCashFlowSummary('org-1', 6)

    const query = normalizado(sqlCapturado[0] ?? '')

    expect(query).toContain('left join')
    expect(query).toContain('"categories"')
    expect(query).toMatch(/coalesce\(\s*"transactions"\."affects_cash_flow",\s*"categories"\."affects_cash_flow",\s*true\s*\)/)
  })

  it('aplica a mesma regra na projeção, não só no realizado', async () => {
    // A projeção some pelo mesmo motivo que o realizado: aplicação em
    // investimento não é despesa nem quando é futura.
    await getFutureMonthlyCashFlowSummary('org-1', 24)

    const query = normalizado(sqlCapturado[0] ?? '')

    expect(query).toMatch(/coalesce\(\s*"transactions"\."affects_cash_flow",\s*"categories"\."affects_cash_flow",\s*true\s*\)/)
  })

  it('mantém o filtro de isIgnored, que resolve outro problema', async () => {
    // isIgnored significa "lançamento errado, não existe". O flag novo
    // significa "existe e é real, só não é resultado de caixa". Um não
    // substitui o outro.
    await getMonthlyCashFlowSummary('org-1', 6)

    expect(normalizado(sqlCapturado[0] ?? '')).toContain('"is_ignored" = false')
  })
})
