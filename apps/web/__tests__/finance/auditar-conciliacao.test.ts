import { describe, it, expect, vi, beforeEach } from 'vitest'

const capturar = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => capturar(...a) }))

let achados = { paresQueMovemSaldo: [] as unknown[], divergencias: [] as unknown[], invarianteQuebrado: [] as unknown[] }
vi.mock('@/lib/finance/conciliacao/auditoria', async () => {
  const actual = await vi.importActual<typeof import('@/lib/finance/conciliacao/auditoria')>('@/lib/finance/conciliacao/auditoria')
  return { ...actual, auditarConciliacao: async () => achados }
})
vi.mock('@floow/db', async () => {
  const actual = await vi.importActual<typeof import('@floow/db')>('@floow/db')
  return { ...actual, getDb: () => ({}) }
})

const { GET } = await import('@/app/api/cron/auditar-conciliacao/route')
const { divergenciasRelevantes } = await import('@/lib/finance/conciliacao/auditoria')

const pedido = (token?: string) =>
  new Request('https://floow.app/api/cron/auditar-conciliacao', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => {
  capturar.mockClear()
  process.env.CRON_SECRET = 'segredo'
  achados = { paresQueMovemSaldo: [], divergencias: [], invarianteQuebrado: [] }
})

describe('cron auditar-conciliacao', () => {
  it('sem segredo: 401 e não audita', async () => {
    const r = await GET(pedido())
    expect(r.status).toBe(401)
    expect(capturar).not.toHaveBeenCalled()
  })

  it('nada achado: 200 e nenhum evento', async () => {
    const r = await GET(pedido('segredo'))
    expect(r.status).toBe(200)
    expect(capturar).not.toHaveBeenCalled()
  })

  it('um evento por tipo de achado, só com contagens e ids de conta', async () => {
    achados = {
      paresQueMovemSaldo: [{ accountId: 'nubank', pares: 2 }],
      divergencias: [],
      invarianteQuebrado: [{ accountId: 'itau', linhas: 1 }],
    }
    await GET(pedido('segredo'))
    expect(capturar).toHaveBeenCalledTimes(2)
    const [mensagem, contexto] = capturar.mock.calls[0] as [string, { level: string; tags: Record<string, string>; extra: Record<string, unknown> }]
    expect(mensagem).toMatch(/par que move saldo/)
    expect(contexto.level).toBe('warning')
    expect(contexto.tags).toMatchObject({ auditoria: 'conciliacao', achado: 'par_move_saldo' })
    expect(contexto.extra).toEqual({ total: 2, contas: [{ accountId: 'nubank', pares: 2 }] })
  })
})

describe('divergenciasRelevantes', () => {
  it('só acima de R$ 1,00, e ignora conta sem saldo do banco', () => {
    expect(
      divergenciasRelevantes([
        { accountId: 'a', saldoLocalCents: 10_100, saldoBancoCents: 10_000 },
        { accountId: 'b', saldoLocalCents: 10_101, saldoBancoCents: 10_000 },
        { accountId: 'c', saldoLocalCents: 9_000, saldoBancoCents: 10_000 },
        { accountId: 'd', saldoLocalCents: 1, saldoBancoCents: null },
      ]),
    ).toEqual([
      { accountId: 'b', diferencaCents: 101 },
      { accountId: 'c', diferencaCents: -1_000 },
    ])
  })
})
