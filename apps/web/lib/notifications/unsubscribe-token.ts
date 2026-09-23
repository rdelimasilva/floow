import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token do link "parar de receber" do e-mail de ritmo.
 *
 * O link precisa funcionar sem login (a pessoa clica no celular, fora do app),
 * então a autorização é a própria assinatura: `base64url(userId).hmac`. Não
 * expira de propósito — um descadastro que para de funcionar depois de uns dias
 * é o tipo de coisa que faz o e-mail ir para o spam.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sign(payload: string, secret: string): string {
  return createHmac('sha256', `unsubscribe:${secret}`).update(payload).digest('base64url')
}

export function signUnsubscribeToken(userId: string, secret: string | undefined): string {
  if (!secret) throw new Error('Segredo de descadastro não configurado')
  const payload = Buffer.from(userId, 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** userId se o token for válido; null em qualquer outro caso. */
export function verifyUnsubscribeToken(token: string, secret: string | undefined): string | null {
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, sig] = parts

  const expected = Buffer.from(sign(payload, secret), 'utf8')
  const presented = Buffer.from(sig, 'utf8')
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) return null

  const userId = Buffer.from(payload, 'base64url').toString('utf8')
  return UUID_RE.test(userId) ? userId : null
}
