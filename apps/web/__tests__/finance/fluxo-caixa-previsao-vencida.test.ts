import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * A projeção do fluxo de caixa pegava toda previsão com `balance_applied =
 * false`, sem limite de data para trás. Recorrência criada hoje com início em
 * janeiro gera ocorrências passadas que ninguém concilia, e elas ficavam
 * somando como "projetado" — em "Ambos", o mesmo salário contava duas vezes
 * nos meses que já passaram (o realizado do banco e a previsão vencida).
 *
 * A projeção tem que seguir a regra do saldo projetado da listagem
 * (`contaNoSaldoProjetado` / `sqlContaNoSaldo`): previsão só projeta enquanto
 * está por vencer, sem vínculo com o realizado e sem proposta de conciliação
 * aberta.
 *
 * Com `db` mockado, o que se prende é o SQL gerado — não o Postgres avaliar.
 */

const sqlCapturado: string[] = []
const paramsCapturados: unknown[][] = []
const dialect = new PgDialect()

function capturar(query: unknown) {
  const q = dialect.sqlToQuery(query as never)
  sqlCapturado.push(q.sql)
  paramsCapturados.push(q.params)
}

const mockDb = {
  execute: (query: unknown) => {
    capturar(query)
    return Promise.resolve([])
  },
  select: () => ({
    from: () => ({
      where: (condicao: unknown) => {
        capturar(condicao)
        return { orderBy: () => Promise.resolve([]) }
      },
    }),
  }),
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

const { getFutureMonthlyCashFlowSummary, getMonthlyCashFlowSummary, getFutureTransactions } =
  await import('@/lib/finance/queries')

function normalizado(texto: string): string {
  return texto.replace(/\s+/g, ' ').toLowerCase()
}

const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

beforeEach(() => {
  sqlCapturado.length = 0
  paramsCapturados.length = 0
})

describe.each([
  ['resumo mensal projetado', () => getFutureMonthlyCashFlowSummary('org-1', 24)],
  ['lançamentos futuros do detalhamento', () => getFutureTransactions('org-1', 24)],
])('%s', (_nome, carregar) => {
  it('só conta previsão que vence depois de hoje, no fuso de São Paulo', async () => {
    await carregar()

    const query = normalizado(sqlCapturado[0] ?? '')
    expect(query).toMatch(/"transactions"\."date" > \$\d+::date/)
    expect(paramsCapturados[0]).toContain(HOJE)
  })

  it('não conta previsão já casada com o realizado', async () => {
    await carregar()

    expect(normalizado(sqlCapturado[0] ?? '')).toContain('"matched_transaction_id" is null')
  })

  it('não conta previsão com proposta de conciliação aberta', async () => {
    await carregar()

    const query = normalizado(sqlCapturado[0] ?? '')
    expect(query).toContain('not exists (select 1 from "forecast_match_proposals"')
    expect(query).toContain("'pending'")
  })
})

describe('resumo mensal realizado', () => {
  it('não ganha o filtro de previsão — o realizado é o que já aconteceu', async () => {
    await getMonthlyCashFlowSummary('org-1', 12)

    const query = normalizado(sqlCapturado[0] ?? '')
    expect(query).not.toContain('"matched_transaction_id" is null')
    expect(query).not.toContain('forecast_match_proposals')
  })
})
