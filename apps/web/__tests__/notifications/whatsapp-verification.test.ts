import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  requestCode, confirmCode, hashCode, MAX_ATTEMPTS, type VerificationDeps, type PendingCode,
} from '@/lib/notifications/whatsapp-verification'

const U = 'u1'
const PHONE = '+5511999998888'
const NOW = new Date('2026-09-25T12:00:00Z')

afterEach(() => vi.restoreAllMocks())

function deps(over: Partial<VerificationDeps> = {}): VerificationDeps {
  return {
    isVerifiedByOther: vi.fn(async () => false),
    consumeSendQuota: vi.fn(async () => true),
    savePending: vi.fn(async () => {}),
    loadPending: vi.fn(async () => undefined),
    claimAttempt: vi.fn(async () => undefined),
    markVerified: vi.fn(async () => 'ok' as const),
    deletePending: vi.fn(async () => {}),
    sendCode: vi.fn(async () => ({ ok: true as const, id: 'w' })),
    secret: 's',
    now: () => NOW,
    generateCode: () => '123456',
    ...over,
  }
}
const pending = (over: Partial<PendingCode> = {}): PendingCode => ({
  phone: PHONE, codeHash: hashCode(U, PHONE, '123456', 's'),
  expiresAt: new Date(NOW.getTime() + 60_000), attempts: 0, ...over,
})

describe('requestCode', () => {
  it('normaliza, grava só o hash e manda o código', async () => {
    const d = deps()
    expect(await requestCode(U, '(11) 99999-8888', d)).toEqual({ ok: true, phone: PHONE })
    const saved = vi.mocked(d.savePending).mock.calls[0][0]
    expect(saved).toMatchObject({ userId: U, phone: PHONE, codeHash: hashCode(U, PHONE, '123456', 's') })
    expect(saved.expiresAt.getTime()).toBe(NOW.getTime() + 600_000)
    expect(JSON.stringify(saved)).not.toContain('"123456"')
    expect(d.sendCode).toHaveBeenCalledWith(PHONE, '123456')
  })

  it('telefone inválido', async () => {
    const d = deps()
    expect(await requestCode(U, '123', d)).toEqual({ ok: false, error: 'invalid_phone' })
    expect(d.consumeSendQuota).not.toHaveBeenCalled()
  })

  it('número já verificado por outro usuário: mas só depois de consumir a cota', async () => {
    const d = deps({ isVerifiedByOther: vi.fn(async () => true) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'in_use' })
    expect(d.consumeSendQuota).toHaveBeenCalledWith(U)
    expect(d.sendCode).not.toHaveBeenCalled()
  })

  it('passou do limite de envios: não grava, não manda, nem chega a checar in_use', async () => {
    const d = deps({ consumeSendQuota: vi.fn(async () => false) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'rate_limited' })
    expect(d.isVerifiedByOther).not.toHaveBeenCalled()
    expect(d.savePending).not.toHaveBeenCalled()
    expect(d.sendCode).not.toHaveBeenCalled()
  })

  it('falha no envio vira send_failed e apaga o pendente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({ sendCode: vi.fn(async () => ({ ok: false as const, error: 'x' })) })
    expect(await requestCode(U, PHONE, d)).toEqual({ ok: false, error: 'send_failed' })
    expect(d.deletePending).toHaveBeenCalledWith(U)
  })
})

describe('confirmCode', () => {
  it('código certo verifica o número e apaga o pendente', async () => {
    const d = deps({ claimAttempt: vi.fn(async () => pending()) })
    expect(await confirmCode(U, ' 123456 ', d)).toEqual({ ok: true, phone: PHONE })
    expect(d.markVerified).toHaveBeenCalledWith(U, PHONE)
    expect(d.deletePending).toHaveBeenCalledWith(U)
  })

  it('sem código pendente: claim não reivindica nada e não há linha nenhuma', async () => {
    const d = deps({ loadPending: vi.fn(async () => undefined) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'no_pending' })
  })

  it('expirado: claim não reivindica (expires_at > now falha) e a linha está vencida', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending({ expiresAt: new Date(NOW.getTime() - 1) })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'expired' })
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('código errado: o claim já contabilizou a tentativa, não há bump separado', async () => {
    const d = deps({ claimAttempt: vi.fn(async () => pending()) })
    expect(await confirmCode(U, '000000', d)).toEqual({ ok: false, error: 'wrong_code' })
    expect(d.markVerified).not.toHaveBeenCalled()
    expect(d.deletePending).not.toHaveBeenCalled()
  })

  it('esgotou as tentativas: claim não reivindica (attempts < MAX falha) e a linha confirma o motivo', async () => {
    const d = deps({ loadPending: vi.fn(async () => pending({ attempts: MAX_ATTEMPTS })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'too_many_attempts' })
    expect(d.markVerified).not.toHaveBeenCalled()
  })

  it('outro usuário verificou o número no meio do caminho', async () => {
    const d = deps({
      claimAttempt: vi.fn(async () => pending()),
      markVerified: vi.fn(async () => 'in_use' as const),
    })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'in_use' })
  })

  it('o hash amarra usuário e número: código de outro usuário não serve', async () => {
    const d = deps({ claimAttempt: vi.fn(async () => pending({ codeHash: hashCode('u2', PHONE, '123456', 's') })) })
    expect(await confirmCode(U, '123456', d)).toEqual({ ok: false, error: 'wrong_code' })
  })
})
