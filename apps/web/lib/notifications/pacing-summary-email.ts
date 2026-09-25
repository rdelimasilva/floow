/** E-mail do resumo de ritmo (frequência diária/semanal). Mesmo estilo do e-mail de alerta. */
import { escapeHtml } from './format'
import { summaryLines, type PacingSummary } from './pacing-summary'
import type { BuiltEmail } from './pacing-email'

export function buildPacingSummaryEmail(s: PacingSummary, unsubscribeUrl: string): BuiltEmail {
  const lines = summaryLines(s)
  const [title, ...rest] = lines
  const body = rest.slice(0, -1) // a última é "Ver detalhes: <url>", que vira botão

  const subject = `Ritmo de gastos em ${s.orgName}: ${s.pctOfExpected}% do esperado até o dia ${s.day}`
  const rows = body
    .map((l) => `<tr><td style="padding:6px 0;color:#344054;font-size:14px">${escapeHtml(l)}</td></tr>`)
    .join('\n')

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<tr><td style="font-size:18px;font-weight:700;color:#101828;padding-bottom:8px">${escapeHtml(title)}</td></tr>
${rows}
<tr><td style="padding-top:20px"><a href="${escapeHtml(s.pacingUrl)}" style="display:inline-block;background:#101828;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Ver ritmo de gastos</a></td></tr>
<tr><td style="padding-top:24px;color:#98a2b3;font-size:12px">Você recebe este resumo porque escolheu essa frequência em Configurações.
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#98a2b3">Parar de receber</a>.</td></tr>
</table></body></html>`

  const text = [...lines, '', `Parar de receber: ${unsubscribeUrl}`].join('\n')
  return { subject, html, text }
}
