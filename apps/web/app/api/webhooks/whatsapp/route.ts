/**
 * Webhook do WhatsApp Cloud API.
 *
 * GET: handshake de cadastro (a Meta manda hub.verify_token e espera o
 * hub.challenge de volta). POST: eventos, autenticados pela assinatura HMAC do
 * corpo cru. Responde 200 rápido a todo POST válido — a Meta reenvia o que não
 * recebe 200, e um erro nosso viraria mensagem duplicada.
 */
import { parseWebhook, safeEqual, verifyMetaSignature, maskPhone } from '@/lib/notifications/whatsapp-webhook'
import { handleInboundText } from '@/lib/notifications/whatsapp-inbound'
import { defaultInboundDeps } from '@/lib/notifications/whatsapp-inbound-deps'

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  const token = p.get('hub.verify_token') ?? ''
  if (p.get('hub.mode') === 'subscribe' && expected && safeEqual(token, expected)) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const { texts, errors } = parseWebhook(body)
  for (const e of errors) {
    console.error(`[whatsapp] entrega falhou para ${maskPhone(e.recipient)}: ${e.code ?? '?'} ${e.title ?? ''}`)
  }

  if (texts.length > 0) {
    const deps = defaultInboundDeps()
    for (const t of texts) {
      try {
        await handleInboundText(t, deps)
      } catch (err) {
        console.error(`[whatsapp] erro ao tratar mensagem de ${maskPhone(t.from)}:`, err)
      }
    }
  }

  return new Response('ok', { status: 200 })
}
