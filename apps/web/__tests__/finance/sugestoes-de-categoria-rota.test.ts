import { describe, it, expect, vi, beforeEach } from 'vitest'

const run = vi.fn(async () => ({ pending: 1 }))
vi.mock('@/lib/finance/category-suggestions/job', () => ({ runCategorySuggestionsForOrg: run }))
vi.mock('@/lib/finance/category-suggestions/deps', () => ({ defaultCategorySuggestionDeps: () => ({}) }))
vi.mock('@floow/db', () => ({
  transactions: { orgId: 'org_id', date: 'date' },
  getDb: () => ({
    selectDistinct: () => ({ from: () => ({ where: async () => [{ orgId: 'a' }, { orgId: 'b' }] }) }),
  }),
}))

const { GET } = await import('@/app/api/category-suggestions/run-weekly/route')

beforeEach(() => {
  run.mockClear()
  process.env.CRON_SECRET = 'segredo'
})

describe('rota semanal de sugestões', () => {
  it('401 sem o segredo', async () => {
    const res = await GET(new Request('http://x/api/category-suggestions/run-weekly'))
    expect(res.status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })
  it('roda para cada org ativa; falha de uma não derruba a outra', async () => {
    run.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(new Request('http://x', { headers: { authorization: 'Bearer segredo' } }))
    expect(res.status).toBe(200)
    expect(run).toHaveBeenCalledTimes(2)
    expect(await res.json()).toMatchObject({ ok: true, orgs: 2, failed: 1 })
  })
})
