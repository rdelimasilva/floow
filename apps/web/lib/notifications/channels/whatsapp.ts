/**
 * Canal de WhatsApp: só templates aprovados na Meta (mensagem iniciada pelo
 * floow). O texto de cada template está em docs/notificacoes/whatsapp-meta.md e precisa bater
 * com a quantidade de parâmetros montada aqui.
 */
import { brl, oneLine } from '../format'
import type { PacingAlert } from '../pacing-alerts'
import type { PacingSummary } from '../pacing-summary'
import type { TemplateMessage } from '../send-whatsapp'
import type { ChannelAdapter, ChannelMessage, SendResult } from './types'

export const WA_TEMPLATES = {
  summary: 'floow_resumo_ritmo_v3',
  // A v1 é a que a Meta aceita como Utility: um dado concreto, sem botão.
  // As tentativas "bonitas" (v2 e v3) foram reclassificadas como Marketing.
  alert: 'floow_alerta_ritmo',
} as const

/** Situação da projeção com emoji; vai junto da projeção no {{6}} do resumo. */
export function projectionStatus(diffCents: number): string {
  if (diffCents > 0) return `🔴 estoura em ${brl(diffCents)}`
  if (diffCents < 0) return `✅ sobra ${brl(-diffCents)}`
  return '✅ fecha no orçado'
}

/** Categorias agrupadas por status: "⚠️ Atenção: A, B (estourados) · C (em risco)". */
export function attentionLine(estourados: string[], emRisco: string[]): string {
  const partes: string[] = []
  if (estourados.length > 0) {
    partes.push(`${estourados.join(', ')} (${estourados.length === 1 ? 'estourado' : 'estourados'})`)
  }
  if (emRisco.length > 0) partes.push(`${emRisco.join(', ')} (em risco)`)
  return partes.length > 0 ? `⚠️ Atenção: ${partes.join(' · ')}` : '👍 Nenhuma categoria em risco'
}

/**
 * {{1}}…{{7}} do floow_resumo_ritmo_v3 (o link vai no botão fixo do template).
 * Campos agrupados de propósito: com 11 variáveis a Meta recusou o template
 * ("muitas variáveis para a extensão do texto").
 */
export function summaryParams(s: PacingSummary): string[] {
  return [
    `${s.monthName} · ${s.orgName}`,
    `dia ${s.day} de ${s.daysInMonth}`,
    brl(s.plannedCents),
    brl(s.expectedCents),
    `${brl(s.spentCents)} (${s.pctOfExpected}% do esperado)`,
    `${brl(s.projectedCents)} · ${projectionStatus(s.projectedDiffCents)}`,
    attentionLine(s.estourados, s.emRisco),
  ].map(oneLine)
}

const pctOfPlanned = (a: PacingAlert) =>
  a.plannedCents > 0 ? a.spentCents / a.plannedCents : Number.POSITIVE_INFINITY

/**
 * {{1}}…{{4}} do floow_alerta_ritmo: "Atenção, {{1}}: seus gastos em {{2}} já
 * somam R$ {{3}}, o que representa {{4}}% do previsto para o mês." — o "R$" e o
 * "%" são texto fixo do template, então os parâmetros vão sem eles.
 * O template fala de uma categoria só; com várias, vai a de maior % do orçado
 * (uma mensagem por categoria multiplicaria o custo).
 */
export function alertParams(m: ChannelMessage): string[] {
  const pior = m.alerts.reduce((a, b) => (pctOfPlanned(b) > pctOfPlanned(a) ? b : a))
  const pct = pctOfPlanned(pior)
  return [
    m.orgName,
    m.categoryNames[pior.categoryId] ?? 'Categoria sem nome',
    brl(pior.spentCents).replace(/^R\$\s*/, ''),
    Number.isFinite(pct) ? String(Math.round(pct * 100)) : 'mais de 100',
  ].map(oneLine)
}

export function createWhatsAppChannel(deps: {
  sendTemplate: (msg: TemplateMessage) => Promise<SendResult>
}): ChannelAdapter {
  return {
    async send(r, m) {
      if (!r.whatsappPhone) return { ok: false, error: 'no_phone' }
      return deps.sendTemplate(
        m.kind === 'summary'
          ? { to: r.whatsappPhone, template: WA_TEMPLATES.summary, bodyParams: summaryParams(m.summary) }
          : { to: r.whatsappPhone, template: WA_TEMPLATES.alert, bodyParams: alertParams(m) },
      )
    },
  }
}
