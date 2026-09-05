import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORG = 'org-1'
let orgRow: { reviewGateClearedAt: Date | null } | undefined
let pendingRow: unknown[] = []
let updateCalled = false
let dbShouldThrow = false
let getOrgIdImpl: () => Promise<string> = () => Promise.resolve(ORG)

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            // Heurística: só a tabela `orgs` tem coluna `reviewGateClearedAt`.
            limit: () => {
              if (dbShouldThrow) return Promise.reject(new Error('db indisponivel'))
              return Promise.resolve('reviewGateClearedAt' in table ? (orgRow ? [orgRow] : []) : pendingRow)
            },
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => { updateCalled = true; return Promise.resolve() } }) }),
    }),
  }
})

vi.mock('@/lib/finance/queries', () => ({
  getOrgId: () => getOrgIdImpl(),
}))

import { getReviewGateStatus, getReviewGateStatusSafe } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  orgRow = undefined
  pendingRow = []
  updateCalled = false
  dbShouldThrow = false
  getOrgIdImpl = () => Promise.resolve(ORG)
})

describe('getReviewGateStatus', () => {
  it('org já destravada nunca bloqueia, mesmo com pendência', async () => {
    orgRow = { reviewGateClearedAt: new Date() }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
  })

  it('org travada com pendência bloqueia, sem gravar nada', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(true)
    expect(updateCalled).toBe(false)
  })

  it('org travada sem nenhuma pendência não bloqueia, e não grava nada (leitura pura)', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = []
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
    expect(updateCalled).toBe(false)
  })

  it('nunca grava nada, em nenhum cenário — getReviewGateStatus é leitura pura', async () => {
    for (const scenario of [
      { orgRow: { reviewGateClearedAt: new Date() }, pendingRow: [{ one: 1 }] },
      { orgRow: { reviewGateClearedAt: null }, pendingRow: [{ one: 1 }] },
      { orgRow: { reviewGateClearedAt: null }, pendingRow: [] },
      { orgRow: undefined, pendingRow: [] },
    ] as const) {
      updateCalled = false
      orgRow = scenario.orgRow
      pendingRow = [...scenario.pendingRow]
      await getReviewGateStatus(ORG)
      expect(updateCalled).toBe(false)
    }
  })
})

describe('getReviewGateStatusSafe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('repassa o resultado quando getOrgId e getReviewGateStatus funcionam', async () => {
    orgRow = { reviewGateClearedAt: new Date() }
    const result = await getReviewGateStatusSafe()
    expect(result).toEqual({ ok: true, orgId: ORG, blocked: false })
  })

  it('falha aberto (nao bloqueia) quando getOrgId lanca', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getOrgIdImpl = () => Promise.reject(new Error('No organization found for user'))
    const result = await getReviewGateStatusSafe()
    expect(result).toEqual({ ok: false })
  })

  it('falha aberto (nao bloqueia) quando getReviewGateStatus lanca', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    dbShouldThrow = true
    const result = await getReviewGateStatusSafe()
    expect(result).toEqual({ ok: false })
  })
})
