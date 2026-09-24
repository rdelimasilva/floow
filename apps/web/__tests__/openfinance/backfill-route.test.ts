import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A rota do backfill roda só as rotinas direcionadas, não
 * `backfillCounterparties`: aquele reescreve tipo, categoria e estado de todo
 * o histórico, e rodá-lo de novo desfaria decisões já tomadas em Classificar.
 * O acesso privilegiado ao banco fica em `backfill.ts`; a rota não o abre.
 */

const backfill = vi.fn(async () => ({ updated: 0, skipped: 0 }))
const executar = vi.fn(async (..._a: unknown[]) => ({
  transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2,
}))
const audit = vi.fn(async (..._a: unknown[]) => undefined)

vi.mock('@/lib/auth/session', () => ({ getVerifiedIdentity: vi.fn(async () => ({ userId: 'u-1' })) }))
vi.mock('@/lib/finance/queries', () => ({ getOrgId: vi.fn(async () => 'org-1') }))
vi.mock('@/lib/openfinance/backfill', () => ({
  backfillCounterparties: backfill,
  executarBackfillDeTransferencias: executar,
}))
vi.mock('@/lib/audit/record', () => ({ recordAudit: audit }))

const { POST } = await import('@/app/api/admin/backfill-counterparties/route')

beforeEach(() => {
  for (const f of [backfill, executar, audit]) f.mockClear()
})

describe('POST /api/admin/backfill-counterparties', () => {
  it('não chama o backfill destrutivo; roda o backfill de transferências da org', async () => {
    const res = await POST()
    const body = await res.json()

    expect(backfill).not.toHaveBeenCalled()
    expect(executar).toHaveBeenCalledWith('org-1')
    expect(body).toEqual({ ok: true, transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2 })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { transferenciasDevolvidas: 3, transferenciasSemChave: 1, pernasPrevistas: 2 },
    }))
  })
})
