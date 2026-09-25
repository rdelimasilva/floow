/**
 * Canal de WhatsApp: só templates aprovados na Meta (mensagem iniciada pelo
 * floow). O texto de cada template está em docs/notificacoes/whatsapp-meta.md e precisa bater
 * com a quantidade de parâmetros montada aqui.
 */
import { brl, oneLine } from '../format'
import { projectionPhrase, type PacingSummary } from '../pacing-summary'
import type { TemplateMessage } from '../send-whatsapp'
import type { ChannelAdapter, ChannelMessage, SendResult } from './types'

export const WA_TEMPLATES = {
  code: 'floow_codigo',
  summary: 'floow_resumo_ritmo',
  alert: 'floow_alerta_ritmo',
} as const

/** {{1}}…{{12}} do floow_resumo_ritmo. */
export function summaryParams(s: PacingSummary): string[] {
  return [
    s.orgName,
    s.monthName,
    String(s.day),
    String(s.daysInMonth),
    brl(s.plannedCents),
    brl(s.expectedCents),
    brl(s.spentCents),
    `${s.pctOfExpected}%`,
    brl(s.projectedCents),
    projectionPhrase(s.projectedDiffCents),
    s.flagged,
    s.pacingUrl,
  ].map(oneLine)
}

/** {{1}}…{{3}} do floow_alerta_ritmo. */
export function alertParams(m: ChannelMessage): string[] {
  const line = m.alerts
    .map((a) => {
      const name = m.categoryNames[a.categoryId] ?? 'Categoria sem nome'
      return `${name} ${a.status === 'estourado' ? 'estourou o teto' : 'vai estourar no ritmo atual'}`
    })
    .join(' · ')
  return [m.orgName, line, m.pacingUrl].map(oneLine)
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
