/**
 * Envio de e-mail transacional pelo Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * `fetch` direto em vez do SDK: é uma chamada só, e assim não entra dependência.
 * Sem RESEND_API_KEY o envio vira no-op com aviso — o cron diário não pode
 * quebrar em ambiente de dev/preview só porque o e-mail não está configurado.
 */
export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  /** URL de descadastro — vira o header List-Unsubscribe (Gmail/Outlook mostram o botão nativo). */
  unsubscribeUrl?: string
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string }

export async function sendEmail(
  input: SendEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY/EMAIL_FROM ausentes — e-mail não enviado')
    return { ok: false, error: 'not_configured' }
  }

  const headers: Record<string, string> = {}
  if (input.unsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }

  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `resend_${res.status}: ${body.slice(0, 200)}` }
  }
  const data = (await res.json()) as { id?: string }
  return { ok: true, id: data.id ?? '' }
}
