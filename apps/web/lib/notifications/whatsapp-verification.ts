/**
 * Ligação do WhatsApp por verificação invertida: o app mostra um código e a
 * pessoa o envia do próprio WhatsApp. O webhook liga à conta o número que
 * mandou a mensagem — o `from` chega autenticado pela assinatura da Meta, então
 * possuir o código prova a conta e mandar a mensagem prova o número.
 *
 * Regras aqui, I/O nas deps, para testar sem banco nem Meta. Guarda só o HMAC
 * do código. O hash não inclui o usuário: o webhook precisa achar o código sem
 * saber de quem é (code_hash é único no banco, ver 00066).
 *
 * Força bruta: 31^8 (~39,6 bits) combinações, cada código vale 10 minutos, e
 * cada remetente tem 5 tentativas por hora antes mesmo de chegar ao banco.
 */
import { createHmac, randomInt } from 'node:crypto'
import { phoneCandidatesFromWaId } from './phone'

/** Sem 0/O, 1/I/L: o código é lido na tela e digitado ou enviado pelo link. */
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LINK_CODE_LENGTH = 8
export const LINK_CODE_TTL_MS = 10 * 60 * 1000

export interface StartLinkDeps {
  /** true se ainda cabe gerar código nesta hora (limite por usuário). */
  consumeStartQuota(userId: string): Promise<boolean>
  /** Grava por cima do pendente anterior do mesmo usuário (PK user_id). */
  savePending(p: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>
  secret: string
  now(): Date
  generateCode(): string
}

export interface CompleteLinkDeps {
  /** true se ainda cabe tentativa nesta hora (limite por quem envia). */
  consumeSenderQuota(waId: string): Promise<boolean>
  /**
   * Apaga e devolve o dono do código numa operação só (DELETE ... RETURNING),
   * só se ainda não expirou. undefined = inválido ou expirado. Uso único: duas
   * mensagens com o mesmo código não conseguem as duas reivindicá-lo.
   */
  claimCode(codeHash: string): Promise<string | undefined>
  /** 'in_use' quando o índice único recusa (número ligado a outra conta). */
  markVerified(userId: string, phone: string): Promise<'ok' | 'in_use'>
  secret: string
}

export type StartLinkResult = { ok: true; code: string; expiresAt: Date } | { ok: false; error: 'rate_limited' }
export type CompleteLinkResult = 'linked' | 'invalid' | 'in_use' | 'rate_limited'

export function generateLinkCode(): string {
  let code = ''
  for (let i = 0; i < LINK_CODE_LENGTH; i++) code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)]
  return code
}

const normalizeCode = (code: string) => code.replace(/-/g, '').toUpperCase()

export function hashLinkCode(code: string, secret: string): string {
  return createHmac('sha256', `whatsapp-link:${secret}`).update(normalizeCode(code)).digest('hex')
}

export const formatLinkCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

const LINK_MESSAGE = /^\s*floow\s+([a-z0-9]{4})-?([a-z0-9]{4})\s*$/i

/** Código normalizado (maiúsculas, sem hífen), ou null se não é mensagem de vínculo. */
export function parseLinkMessage(text: string): string | null {
  const m = LINK_MESSAGE.exec(text)
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null
}

/** E.164 do wa_id; celular BR que chega sem o nono dígito ganha o 9. */
export function canonicalPhoneFromWaId(waId: string): string {
  const candidates = phoneCandidatesFromWaId(waId)
  return candidates[candidates.length - 1]
}

export async function startLink(userId: string, deps: StartLinkDeps): Promise<StartLinkResult> {
  if (!(await deps.consumeStartQuota(userId))) return { ok: false, error: 'rate_limited' }
  const code = deps.generateCode()
  const expiresAt = new Date(deps.now().getTime() + LINK_CODE_TTL_MS)
  await deps.savePending({ userId, codeHash: hashLinkCode(code, deps.secret), expiresAt })
  return { ok: true, code, expiresAt }
}

export async function completeLink(waId: string, code: string, deps: CompleteLinkDeps): Promise<CompleteLinkResult> {
  if (!/^\d{8,15}$/.test(waId)) return 'invalid'
  // O limite vem antes de reivindicar: estourado, a tentativa não chega a
  // testar o código — é isto que torna a força bruta inviável.
  if (!(await deps.consumeSenderQuota(waId))) return 'rate_limited'
  const userId = await deps.claimCode(hashLinkCode(code, deps.secret))
  if (!userId) return 'invalid'
  return (await deps.markVerified(userId, canonicalPhoneFromWaId(waId))) === 'in_use' ? 'in_use' : 'linked'
}
