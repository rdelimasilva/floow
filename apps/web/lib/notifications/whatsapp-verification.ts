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
  /**
   * Incrementa `attempts` e devolve a linha atomicamente, só quando ainda cabe
   * tentativa (attempts < MAX_ATTEMPTS) e o código não expirou. undefined
   * quando nada foi reivindicado — chamador então usa loadPending só para
   * classificar o motivo (sem pendente, expirado ou tentativas esgotadas).
   * Isto fecha a corrida de duas tentativas simultâneas lendo attempts=0 e
   * cada uma ganhando uma tentativa própria.
   */
  claimAttempt(userId: string): Promise<PendingCode | undefined>
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
  // A cota vem antes de checar "já verificado": na ordem inversa, alguém sem
  // conta consegue descobrir de graça, número por número, quais já pertencem
  // a um usuário do floow — a checagem de in_use não custa nada a quem
  // pergunta. Aqui ela já sai cara depois de MAX_SENDS_PER_HOUR tentativas.
  if (!(await deps.consumeSendQuota(userId))) return { ok: false, error: 'rate_limited' }
  if (await deps.isVerifiedByOther(userId, phone)) return { ok: false, error: 'in_use' }

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
    // Sem isto o pendente ficava com um código que nunca chegou, ocupando a
    // linha (PK por userId) até expirar sozinho.
    await deps.deletePending(userId)
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true, phone }
}

export async function confirmCode(
  userId: string,
  code: string,
  deps: VerificationDeps,
): Promise<ConfirmCodeResult> {
  // O claim já soma a tentativa atomicamente (UPDATE ... RETURNING no banco):
  // duas chamadas simultâneas não podem ambas ler attempts=0 e cada uma achar
  // que tem tentativa de sobra.
  const claimed = await deps.claimAttempt(userId)
  if (!claimed) {
    // Classifica sem o relógio do app: o claim já decidiu contra o relógio do
    // banco (o mesmo que grava expires_at). Comparar de novo aqui com
    // deps.now() arriscava os dois relógios discordarem por alguns
    // milissegundos e trocar o motivo mostrado.
    const pending = await deps.loadPending(userId)
    if (!pending) return { ok: false, error: 'no_pending' }
    if (pending.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' }
    return { ok: false, error: 'expired' }
  }

  const expected = Buffer.from(claimed.codeHash, 'utf8')
  const presented = Buffer.from(hashCode(userId, claimed.phone, code.trim(), deps.secret), 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return { ok: false, error: 'wrong_code' }
  }

  if ((await deps.markVerified(userId, claimed.phone)) === 'in_use') return { ok: false, error: 'in_use' }
  await deps.deletePending(userId)
  return { ok: true, phone: claimed.phone }
}
