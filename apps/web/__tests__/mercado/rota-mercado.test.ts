import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
const executar = vi.fn(async (..._a: unknown[]) => ({ ok: true, linhas: 6 }))
vi.mock('@/lib/mercado/execucao', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mercado/execucao')>('@/lib/mercado/execucao')
  return { ...actual, executarJob: (...a: unknown[]) => executar(...a) }
})
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getServiceDb: () => ({}) }
})

const { GET } = await import('@/app/api/cron/mercado-bcb/route')

const pedido = (token?: string) =>
  new Request('https://floow.app/api/cron/mercado-bcb', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => {
  executar.mockClear()
  process.env.CRON_SECRET = 'segredo'
})

describe('rota mercado-bcb', () => {
  it('sem segredo: 401 e nada roda', async () => {
    expect((await GET(pedido())).status).toBe(401)
    expect(executar).not.toHaveBeenCalled()
  })

  it('com o segredo do cron: roda o job bcb', async () => {
    const r = await GET(pedido('segredo'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, linhas: 6 })
    expect(executar).toHaveBeenCalledWith('bcb', expect.anything(), expect.any(Function))
  })
})
