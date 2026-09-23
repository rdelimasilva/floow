/**
 * Monta o e-mail de ritmo de gasto (assunto, HTML e texto puro).
 *
 * HTML de e-mail vive em 2005: tabela e estilo inline, nada de classe CSS.
 * Sem dependência de template — é um e-mail só, e string pura é testável.
 */
import type { PacingAlert } from './pacing-alerts'

export interface PacingEmailInput {
  orgName: string
  /** YYYY-MM */
  month: string
  daysElapsed: number
  daysInMonth: number
  alerts: PacingAlert[]
  categoryNames: Record<string, string>
  pacingUrl: string
  unsubscribeUrl: string
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * "23 de setembro de 2026". Montada de `month` + dia, e não de um Date, para não
 * depender do fuso do servidor: o dia já vem resolvido em America/Sao_Paulo.
 */
function dataPorExtenso(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  return `${day} de ${MESES[m - 1]} de ${y}`
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function describe(a: PacingAlert): string {
  if (a.status === 'estourado') {
    return `Gasto de ${brl(a.spentCents)} contra um teto de ${brl(a.plannedCents)} (${pct(a.spentCents, a.plannedCents)}%).`
  }
  return `Gasto de ${brl(a.spentCents)} até agora. No ritmo atual, fecha o mês em ${brl(a.projectedCents)} contra um teto de ${brl(a.plannedCents)} (${pct(a.projectedCents, a.plannedCents)}%).`
}

export function buildPacingEmail(input: PacingEmailInput): BuiltEmail {
  const { alerts, categoryNames, daysElapsed, daysInMonth, orgName } = input
  const nameOf = (id: string) => categoryNames[id] ?? 'Categoria sem nome'

  const subject =
    alerts.length === 1
      ? alerts[0].status === 'estourado'
        ? `Orçamento estourado: ${nameOf(alerts[0].categoryId)}`
        : `No ritmo atual, ${nameOf(alerts[0].categoryId)} vai estourar`
      : `Ritmo de gastos: ${alerts.length} categorias pedem atenção`

  const intro = `${dataPorExtenso(input.month, daysElapsed)} · dia ${daysElapsed} de ${daysInMonth} do mês em ${orgName}.`

  const rows = alerts
    .map((a) => {
      const color = a.status === 'estourado' ? '#b42318' : '#b54708'
      const label = a.status === 'estourado' ? 'Estourado' : 'Em risco'
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #eaecf0">
<div style="font-weight:600;color:#101828">${escapeHtml(nameOf(a.categoryId))}
<span style="font-size:12px;font-weight:600;color:${color};margin-left:8px">${label}</span></div>
<div style="color:#475467;font-size:14px;margin-top:4px">${escapeHtml(describe(a))}</div>
</td></tr>`
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<tr><td style="font-size:18px;font-weight:700;color:#101828;padding-bottom:4px">Ritmo de gastos</td></tr>
<tr><td style="color:#475467;font-size:14px;padding-bottom:8px">${escapeHtml(intro)}</td></tr>
${rows}
<tr><td style="padding-top:20px"><a href="${escapeHtml(input.pacingUrl)}" style="display:inline-block;background:#101828;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px">Ver ritmo de gastos</a></td></tr>
<tr><td style="padding-top:24px;color:#98a2b3;font-size:12px">Você recebe este e-mail quando uma categoria entra em risco ou estoura o teto.
<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#98a2b3">Parar de receber</a>.</td></tr>
</table></body></html>`

  const text = [
    'Ritmo de gastos',
    intro,
    '',
    ...alerts.map((a) => `- ${nameOf(a.categoryId)}: ${describe(a)}`),
    '',
    `Ver ritmo de gastos: ${input.pacingUrl}`,
    `Parar de receber: ${input.unsubscribeUrl}`,
  ].join('\n')

  return { subject, html, text }
}
