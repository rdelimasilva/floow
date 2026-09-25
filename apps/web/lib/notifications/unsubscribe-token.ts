import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token do link "parar de receber" do e-mail de ritmo.
 *
 * O link precisa funcionar sem login (a pessoa clica no celular, fora do app),
 * então a autorização é a própria assinatura: `base64url(userId[:orgId]).hmac`.
 * Não expira de propósito — um descadastro que para de funcionar depois de uns
 * dias é o tipo de coisa que faz o e-mail ir para o spam.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sign(payload: string, secret: string): string {
  return createHmac('sha256', `unsubscribe:${secret}`).update(payload).digest('base64url')
}

export function signUnsubscribeToken(
  userId: string,
  secret: string | undefined,
  orgId?: string,
): string {
  if (!secret) throw new Error('Segredo de descadastro não configurado')
  const raw = orgId ? `${userId}:${orgId}` : userId
  const payload = Buffer.from(raw, 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/**
 * { userId, orgId } se o token for válido; null em qualquer outro caso.
 * orgId null = token anterior à preferência por org (vale para todas).
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string | undefined,
): { userId: string; orgId: string | null } | null {
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts

  const expected = Buffer.from(sign(payload, secret), 'utf8')
  const presented = Buffer.from(sig, 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null

  const [userId, orgId, ...resto] = Buffer.from(payload, 'base64url').toString('utf8').split(':')
  if (resto.length > 0 || !UUID_RE.test(userId)) return null
  if (orgId === undefined) return { userId, orgId: null }
  return UUID_RE.test(orgId) ? { userId, orgId } : null
}
