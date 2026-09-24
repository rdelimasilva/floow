import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A rota do backfill roda a rotina direcionada, não `backfillCounterparties`:
 * aquele reescreve tipo, categoria e estado de todo o histórico, e rodá-lo de
 * novo desfaria decisões já tomadas em Classificar.
 */

const backfill = vi.fn(async () => ({ updated: 0, skipped: 0 }))
const devolver = vi.fn(async (..._a: unknown[]) => ({ devolvidas: 3, semChave: 1 }))
const pernas = vi.fn(async (..._a: unknown[]) => ({ criadas: 2 }))
const audit = vi.fn(async (..._a: unknown[]) => undefined)

vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity: vi.fn(async () => ({ userId: 'u-1' })) }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => 'org-1') }))
vi.mock('@floow/db', () => ({ getDb: () => ({ fake: true }) }))
vi.mock('@/lib/openfinance/backfill', () => ({ backfillCounterparties: backfill }))
vi.mock('@/lib/openfinance/transferencias-sem-par', () => ({ devolverTransferenciasSemParAClassificar: devolver }))
vi.mock('@/lib/openfinance/pernas-faltantes', () => ({ criarPernasPrevistasFaltantes: pernas }))
vi.mock('@/lib/audit/record', () => ({ recordAudit: audit }))

const { POST } = await import('@/app/api/admin/backfill-counterparties/route')

beforeEach(() => {
  for (const f of [backfill, devolver, pernas, audit]) f.mockClear()
})

describe('POST /api/admin/backfill-counterparties', () => {
  it('não chama o backfill destrutivo; roda a rotina direcionada e depois as pernas faltantes', async () => {
    const res = await POST()
    const body = await res.json()

    expect(backfill).not.toHaveBeenCalled()
    expect(devolver).toHaveBeenCalledWith({ fake: true }, 'org-1')
    expect(pernas).toHaveBeenCalledWith({ fake: true }, 'org-1')
    expect(devolver.mock.invocationCallOrder[0]).toBeLessThan(pernas.mock.invocationCallOrder[0])
    expect(body).toEqual({ ok: true, transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2 })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2 },
    }))
  })
})
