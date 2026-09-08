import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A contagem que alimenta o badge da sidebar. Conta CONTRAPARTES, não
 * lançamentos: a fila pede uma decisão por contraparte, então 196 é o número
 * de cliques que faltam, e 575 é só o volume por trás deles.
 *
 * Roda no layout de `(app)`, em todo request, então é uma query de agregação
 * e não `getPendingCounterpartyGroups().length` — aquela carrega os grupos
 * inteiros com os itens de cada um.
 */

let countRow: unknown[] = []

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(countRow),
        }),
      }),
    }),
  }
})

vi.mock('@/lib/finance/queries', () => ({ getOrgId: () => Promise.resolve('org-1') }))

const { getPendingCounterpartyCount } = await import('@/lib/openfinance/counterparty-queries')

beforeEach(() => {
  countRow = []
})

describe('getPendingCounterpartyCount', () => {
  it('devolve number mesmo com o count vindo como string do Postgres', async () => {
    // `count()` volta como bigint, que o driver entrega em string. Sem a
    // coercao, o badge renderizaria e as comparacoes `> 0` mentiriam.
    countRow = [{ total: '196' }]

    const total = await getPendingCounterpartyCount('org-1')

    expect(total).toBe(196)
  })

  it('devolve 0 quando a agregacao nao traz linha', async () => {
    countRow = []

    expect(await getPendingCounterpartyCount('org-1')).toBe(0)
  })

  it('devolve 0 quando o count e nulo', async () => {
    countRow = [{ total: null }]

    expect(await getPendingCounterpartyCount('org-1')).toBe(0)
  })
})
