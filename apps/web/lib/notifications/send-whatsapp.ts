/**
 * Envio pelo WhatsApp Cloud API da Meta (Graph API).
 *
 * `fetch` direto, como o send-email.ts: são duas chamadas, e assim não entra
 * dependência. Sem WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID vira no-op com
 * aviso — o cron não pode quebrar em dev/preview.
 *
 * Mensagem que parte do floow só sai por template aprovado. Texto livre só é
 * aceito dentro das 24h depois de o usuário escrever (resposta do webhook).
 */
export type SendResult = { ok: true; id: string } | { ok: false; error: string }

export interface TemplateMessage {
  /** E.164, com '+'. */
  to: string
  template: string
  bodyParams: string[]
  /** Parâmetro do botão de URL (índice 0) — o template de código usa. */
  buttonParams?: string[]
}

const text = (t: string) => ({ type: 'text', text: t })

async function post(payload: Record<string, unknown>, fetchImpl: typeof fetch): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  if (!token || !phoneId) {
    console.warn('[whatsapp] WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes — mensagem não enviada')
    return { ok: false, error: 'not_configured' }
  }

  let res: Response
  try {
    res = await fetchImpl(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    // Chamada travada não pode parar o lote do cron — vira ok:false, não exceção.
    // AbortSignal.timeout() rejeita com DOMException, que não é instanceof Error
    // em toda runtime — por isso o .name é lido direto do objeto, não via Error.
    const name = (err as { name?: unknown } | null)?.name
    if (name === 'AbortError' || name === 'TimeoutError') return { ok: false, error: 'whatsapp_timeout' }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `whatsapp_network: ${msg}` }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `whatsapp_${res.status}: ${body.slice(0, 200)}` }
  }
  const data = (await res.json()) as { messages?: { id?: string }[] }
  return { ok: true, id: data.messages?.[0]?.id ?? '' }
}

const digits = (e164: string) => e164.replace(/^\+/, '')

export function sendWhatsAppTemplate(msg: TemplateMessage, fetchImpl: typeof fetch = fetch) {
  const components: Record<string, unknown>[] = [
    { type: 'body', parameters: msg.bodyParams.map(text) },
  ]
  if (msg.buttonParams?.length) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: msg.buttonParams.map(text) })
  }
  return post(
    {
      to: digits(msg.to),
      type: 'template',
      template: { name: msg.template, language: { code: 'pt_BR' }, components },
    },
    fetchImpl,
  )
}

export function sendWhatsAppText(to: string, body: string, fetchImpl: typeof fetch = fetch) {
  return post({ to: digits(to), type: 'text', text: { body } }, fetchImpl)
}
