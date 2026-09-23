import { profiles } from '@floow/db'
import { eq } from 'drizzle-orm'
import { verifyUnsubscribeToken } from '@/lib/notifications/unsubscribe-token'
import { withUserDbFor } from '@/lib/db/rls'

/**
 * Descadastro do e-mail de ritmo, sem login — a autorização é o token assinado.
 *
 * GET só mostra a confirmação: scanners de link dos provedores de e-mail abrem
 * todo link do corpo, e um GET que desligasse a preferência descadastraria a
 * pessoa sem ela clicar. POST desliga — é o que o botão da página e o
 * "cancelar inscrição" nativo do Gmail (List-Unsubscribe-Post) chamam.
 */

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;margin:0;padding:48px 16px">
<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;color:#101828">
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1>${body}</div></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

const invalid = () =>
  page('Link inválido', '<p style="color:#475467">Este link de descadastro não é válido. Você pode desligar o e-mail em Configurações, no app.</p>', 400)

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!verifyUnsubscribeToken(token, process.env.CRON_SECRET)) return invalid()

  return page(
    'Parar de receber o alerta de ritmo?',
    `<p style="color:#475467">Você não vai mais receber e-mails quando uma categoria entrar em risco ou estourar o teto. Dá para religar em Configurações.</p>
<form method="post"><button type="submit" style="background:#101828;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:14px;cursor:pointer">Parar de receber</button></form>`,
  )
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const userId = verifyUnsubscribeToken(token, process.env.CRON_SECRET)
  if (!userId) return invalid()

  // Sob o RLS do dono do token: mesmo com bug aqui, só a própria linha muda.
  await withUserDbFor(userId, (tx) =>
    tx.update(profiles).set({ emailPacingAlerts: false }).where(eq(profiles.id, userId)),
  )

  return page(
    'Pronto',
    '<p style="color:#475467">Você não vai mais receber o alerta de ritmo de gastos. Para religar, vá em Configurações no app.</p>',
  )
}
