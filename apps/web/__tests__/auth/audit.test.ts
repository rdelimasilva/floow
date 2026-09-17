import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  values: vi.fn(),
  getDb: vi.fn(),
  getVerifiedIdentity: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@floow/db', () => ({
  getDb: h.getDb,
  auditLog: { name: 'audit_log' },
}))

vi.mock('@/lib/auth/session', () => ({
  getVerifiedIdentity: h.getVerifiedIdentity,
}))

import { recordAudit } from '@/lib/audit/record'

const ORG = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  h.values.mockResolvedValue(undefined)
  h.getDb.mockReturnValue({ insert: () => ({ values: h.values }) })
  h.getVerifiedIdentity.mockResolvedValue({ userId: USER, orgIds: [ORG] })
  vi.spyOn(console, 'warn').mockImplementation(h.warn)
})

describe('recordAudit', () => {
  it('atribui a ação ao ator e à org da identidade verificada', async () => {
    await recordAudit({ action: 'transactions.export', resource: 'transactions', resourceCount: 42 })

    expect(h.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transactions.export',
        resource: 'transactions',
        resourceCount: 42,
        actorUserId: USER,
        orgId: ORG,
      }),
    )
  })

  it('não aceita ator nem org vindos do chamador — sempre usa a identidade verificada', async () => {
    await recordAudit({
      action: 'x',
      // @ts-expect-error o tipo não permite; o teste prova que também não vaza em runtime
      actorUserId: 'atacante',
      orgId: 'org-alheia',
    })

    expect(h.values).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: USER, orgId: ORG }),
    )
  })

  it('não grava quando não há identidade verificada', async () => {
    h.getVerifiedIdentity.mockResolvedValue(null)

    await expect(recordAudit({ action: 'transactions.export' })).resolves.toBe(false)
    expect(h.values).not.toHaveBeenCalled()
  })

  it('engole falha do banco — auditoria não pode derrubar a requisição', async () => {
    h.values.mockRejectedValue(new Error('conexão caiu'))

    await expect(recordAudit({ action: 'transactions.export' })).resolves.toBe(false)
    expect(h.warn).toHaveBeenCalled()
  })

  it('devolve true quando grava', async () => {
    await expect(recordAudit({ action: 'transactions.export' })).resolves.toBe(true)
  })
})
