/**
 * Canal de WhatsApp: só templates aprovados na Meta (mensagem iniciada pelo
 * floow). O texto de cada template está em docs/notificacoes/whatsapp-meta.md e precisa bater
 * com a quantidade de parâmetros montada aqui.
 */
import { brl, oneLine } from '../format'
import type { PacingSummary } from '../pacing-summary'
import type { TemplateMessage } from '../send-whatsapp'
import type { ChannelAdapter, ChannelMessage, SendResult } from './types'

export const WA_TEMPLATES = {
  summary: 'floow_resumo_ritmo_v2',
  alert: 'floow_alerta_ritmo_v2',
} as const

/** Situação da projeção com o emoji do template ({{10}} do resumo, em negrito lá). */
export function projectionStatus(diffCents: number): string {
  if (diffCents > 0) return `🔴 Estoura em ${brl(diffCents)}`
  if (diffCents < 0) return `✅ Sobra ${brl(-diffCents)}`
  return '✅ Fecha no orçado'
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

/** {{1}}…{{11}} do floow_resumo_ritmo_v2 (o link vai no botão fixo do template). */
export function summaryParams(s: PacingSummary): string[] {
  return [
    s.monthName,
    s.orgName,
    String(s.day),
    String(s.daysInMonth),
    brl(s.plannedCents),
    brl(s.expectedCents),
    brl(s.spentCents),
    `${s.pctOfExpected}%`,
    brl(s.projectedCents),
    projectionStatus(s.projectedDiffCents),
    attentionLine(s.estourados, s.emRisco),
  ].map(oneLine)
}

/** {{1}}…{{2}} do floow_alerta_ritmo_v2: só as categorias que pioraram. */
export function alertParams(m: ChannelMessage): string[] {
  const nameOf = (id: string) => m.categoryNames[id] ?? 'Categoria sem nome'
  const estourados = m.alerts.filter((a) => a.status === 'estourado').map((a) => nameOf(a.categoryId))
  const emRisco = m.alerts.filter((a) => a.status !== 'estourado').map((a) => nameOf(a.categoryId))
  return [m.orgName, attentionLine(estourados, emRisco)].map(oneLine)
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
