/**
 * Ritmo de gasto diário, por org e por canal. Chamado pelo cron /api/cfo/run-daily.
 *
 * Fluxo: calcula o ritmo UMA vez -> por canal, acha o que piorou desde o último
 * envio daquele canal -> para cada membro, decideSend(frequência, dia, piora)
 * -> envia -> grava o estado do canal se algo saiu e havia piora. Estado por
 * canal: se o e-mail sai e o WhatsApp falha, só o WhatsApp repete amanhã.
 */
import type { BudgetPacingAnalyzerInput, PacingStatus } from '@floow/core-finance'
import { selectPacingAlerts, type PacingAlert } from './pacing-alerts'
import { buildPacingSummary } from './pacing-summary'
import { CHANNELS, decideSend, weekdayOf, type Channel } from './schedule'
import type { ChannelAdapter, Recipient } from './channels/types'

export interface PacingAlertsDeps {
  loadPacing(orgId: string): Promise<BudgetPacingAnalyzerInput | undefined>
  loadLastSent(orgId: string, month: string): Promise<Record<Channel, Record<string, PacingStatus>>>
  loadRecipients(orgId: string): Promise<Recipient[]>
  loadOrgName(orgId: string): Promise<string>
  saveSent(orgId: string, month: string, channel: Channel, alerts: PacingAlert[]): Promise<void>
  channels: Record<Channel, ChannelAdapter>
  appUrl: string
}

export async function runPacingAlertsForOrg(
  orgId: string,
  deps: PacingAlertsDeps,
): Promise<{ sent: Record<Channel, number> }> {
  const sent: Record<Channel, number> = { email: 0, whatsapp: 0 }

  const input = await deps.loadPacing(orgId)
  if (!input) return { sent }
  const { total } = input.pacing
  if (total.daysElapsed === 0 || total.plannedCents === 0) return { sent }

  const lastSent = await deps.loadLastSent(orgId, input.month)
  const recipients = await deps.loadRecipients(orgId)
  if (recipients.length === 0) return { sent }

  const orgName = await deps.loadOrgName(orgId)
  const pacingUrl = `${deps.appUrl}/budgets/pacing`
  const summary = buildPacingSummary(input, orgName, pacingUrl)
  const weekday = weekdayOf(input.month, total.daysElapsed)

  for (const channel of CHANNELS) {
    const alerts = selectPacingAlerts(input.pacing, lastSent[channel] ?? {})

    for (const r of recipients) {
      const kind = decideSend(r.frequencies[channel], weekday, alerts.length > 0)
      if (kind === 'none') continue
      try {
        const res = await deps.channels[channel].send(r, {
          kind,
          orgId,
          orgName,
          month: input.month,
          daysElapsed: total.daysElapsed,
          daysInMonth: total.daysInMonth,
          summary,
          alerts,
          categoryNames: input.categoryNames,
          pacingUrl,
        })
        if (res.ok) sent[channel]++
        else console.error(`[ritmo:${channel}] falha org=${orgId} user=${r.userId}: ${res.error}`)
      } catch (err) {
        console.error(`[ritmo:${channel}] erro org=${orgId} user=${r.userId}:`, err)
      }
    }

    // O resumo também mostra as categorias que pioraram, então conta como aviso.
    if (sent[channel] > 0 && alerts.length > 0) {
      try {
        await deps.saveSent(orgId, input.month, channel, alerts)
      } catch (err) {
        // Falha ao gravar o estado de um canal não pode derrubar o outro canal
        // desta mesma org — cada canal é independente.
        console.error(`[ritmo:${channel}] falha ao gravar estado org=${orgId}:`, err)
      }
    }
  }

  return { sent }
}
