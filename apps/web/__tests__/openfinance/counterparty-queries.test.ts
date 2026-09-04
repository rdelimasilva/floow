import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
let orgRow: { reviewGateClearedAt: Date | null } | undefined
let pendingRow: unknown[] = []
let updateCalled = false

vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return {
    ...actual,
    getDb: () => ({
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            // Heurística: só a tabela `orgs` tem coluna `reviewGateClearedAt`.
            limit: () => Promise.resolve('reviewGateClearedAt' in table ? (orgRow ? [orgRow] : []) : pendingRow),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: () => { updateCalled = true; return Promise.resolve() } }) }),
    }),
  }
})

import { getReviewGateStatus } from '@/lib/openfinance/counterparty-queries'

beforeEach(() => {
  orgRow = undefined
  pendingRow = []
  updateCalled = false
})

describe('getReviewGateStatus', () => {
  it('org já destravada nunca bloqueia, mesmo com pendência', async () => {
    orgRow = { reviewGateClearedAt: new Date() }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
  })

  it('org travada com pendência bloqueia', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = [{ one: 1 }]
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(true)
  })

  it('org travada sem nenhuma pendência destrava e grava o timestamp', async () => {
    orgRow = { reviewGateClearedAt: null }
    pendingRow = []
    const status = await getReviewGateStatus(ORG)
    expect(status.blocked).toBe(false)
    expect(updateCalled).toBe(true)
  })
})
