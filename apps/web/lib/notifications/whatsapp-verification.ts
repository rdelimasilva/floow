/**
 * Verificação do número de WhatsApp por código de 6 dígitos.
 *
 * Regras aqui, I/O nas deps (mesmo padrão do job de ritmo), para testar sem
 * banco nem Meta. Guarda só o HMAC do código, amarrado a usuário + número:
 * vazamento da tabela não entrega códigos, e código de um não serve para outro.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { normalizePhone } from './phone'
import type { SendResult } from './send-whatsapp'

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_ATTEMPTS = 5
export const MAX_SENDS_PER_HOUR = 3

export interface PendingCode {
  phone: string
  codeHash: string
  expiresAt: Date
  attempts: number
}

export interface VerificationDeps {
  isVerifiedByOther(userId: string, phone: string): Promise<boolean>
  /** true se ainda cabe um envio nesta hora. */
  consumeSendQuota(userId: string): Promise<boolean>
  savePending(p: { userId: string; phone: string; codeHash: string; expiresAt: Date }): Promise<void>
  loadPending(userId: string): Promise<PendingCode | undefined>
  bumpAttempts(userId: string): Promise<void>
  /** 'in_use' quando o índice único recusa (outro usuário verificou antes). */
  markVerified(userId: string, phone: string): Promise<'ok' | 'in_use'>
  deletePending(userId: string): Promise<void>
  sendCode(phone: string, code: string): Promise<SendResult>
  secret: string
  now(): Date
  generateCode(): string
}

export type RequestCodeResult =
  | { ok: true; phone: string }
  | { ok: false; error: 'invalid_phone' | 'in_use' | 'rate_limited' | 'send_failed' }

export type ConfirmCodeResult =
  | { ok: true; phone: string }
  | { ok: false; error: 'no_pending' | 'expired' | 'too_many_attempts' | 'wrong_code' | 'in_use' }

export function hashCode(userId: string, phone: string, code: string, secret: string): string {
  return createHmac('sha256', `whatsapp-code:${secret}`).update(`${userId}:${phone}:${code}`).digest('hex')
}

export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export async function requestCode(
  userId: string,
  rawPhone: string,
  deps: VerificationDeps,
): Promise<RequestCodeResult> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return { ok: false, error: 'invalid_phone' }
  if (await deps.isVerifiedByOther(userId, phone)) return { ok: false, error: 'in_use' }
  // Cada código custa dinheiro e chega no celular de alguém: a trava vem
  // antes de gravar e de enviar.
  if (!(await deps.consumeSendQuota(userId))) return { ok: false, error: 'rate_limited' }

  const code = deps.generateCode()
  await deps.savePending({
    userId,
    phone,
    codeHash: hashCode(userId, phone, code, deps.secret),
    expiresAt: new Date(deps.now().getTime() + CODE_TTL_MS),
  })
  const res = await deps.sendCode(phone, code)
  if (!res.ok) {
    console.error(`[whatsapp-codigo] falha user=${userId}: ${res.error}`)
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true, phone }
}

export async function confirmCode(
  userId: string,
  code: string,
  deps: VerificationDeps,
): Promise<ConfirmCodeResult> {
  const pending = await deps.loadPending(userId)
  if (!pending) return { ok: false, error: 'no_pending' }
  if (pending.expiresAt.getTime() <= deps.now().getTime()) return { ok: false, error: 'expired' }
  if (pending.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' }

  const expected = Buffer.from(pending.codeHash, 'utf8')
  const presented = Buffer.from(hashCode(userId, pending.phone, code.trim(), deps.secret), 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    await deps.bumpAttempts(userId)
    return { ok: false, error: 'wrong_code' }
  }

  if ((await deps.markVerified(userId, pending.phone)) === 'in_use') return { ok: false, error: 'in_use' }
  await deps.deletePending(userId)
  return { ok: true, phone: pending.phone }
}
