/**
 * E-mail diário de ritmo de gasto, por org. Chamado pelo cron /api/cfo/run-daily.
 *
 * Fluxo: calcula o ritmo -> filtra o que piorou desde o último e-mail do mês ->
 * manda para cada membro com a preferência ligada -> grava o que foi enviado.
 * O estado só é gravado se ao menos um envio deu certo; se o Resend cair, o
 * alerta sai no dia seguinte em vez de se perder.
 */
import type { BudgetPacingAnalyzerInput, PacingStatus } from '@floow/core-finance'
import { selectPacingAlerts, type PacingAlert } from './pacing-alerts'
import { buildPacingEmail } from './pacing-email'
import { signUnsubscribeToken } from './unsubscribe-token'
import type { SendEmailInput, SendEmailResult } from './send-email'

export interface Recipient {
  userId: string
  email: string
}

export interface PacingEmailDeps {
  loadPacing(orgId: string): Promise<BudgetPacingAnalyzerInput | undefined>
  loadLastSent(orgId: string, month: string): Promise<Record<string, PacingStatus>>
  loadRecipients(orgId: string): Promise<Recipient[]>
  loadOrgName(orgId: string): Promise<string>
  send(input: SendEmailInput): Promise<SendEmailResult>
  saveSent(orgId: string, month: string, alerts: PacingAlert[]): Promise<void>
  appUrl: string
  secret: string | undefined
}

export async function runPacingEmailForOrg(
  orgId: string,
  deps: PacingEmailDeps,
): Promise<{ sent: number; alerts: number }> {
  const input = await deps.loadPacing(orgId)
  if (!input) return { sent: 0, alerts: 0 }

  const lastSent = await deps.loadLastSent(orgId, input.month)
  const alerts = selectPacingAlerts(input.pacing, lastSent)
  if (alerts.length === 0) return { sent: 0, alerts: 0 }

  const recipients = await deps.loadRecipients(orgId)
  if (recipients.length === 0) return { sent: 0, alerts: alerts.length }

  const orgName = await deps.loadOrgName(orgId)
  const pacingUrl = `${deps.appUrl}/budgets/pacing`

  let sent = 0
  for (const r of recipients) {
    const unsubscribeUrl = `${deps.appUrl}/api/email/unsubscribe?token=${signUnsubscribeToken(r.userId, deps.secret)}`
    const email = buildPacingEmail({
      orgName,
      month: input.month,
      daysElapsed: input.pacing.total.daysElapsed,
      daysInMonth: input.pacing.total.daysInMonth,
      alerts,
      categoryNames: input.categoryNames,
      pacingUrl,
      unsubscribeUrl,
    })
    const res = await deps.send({ to: r.email, ...email, unsubscribeUrl })
    if (res.ok) sent++
    else console.error(`[email-ritmo] falha org=${orgId} user=${r.userId}: ${res.error}`)
  }

  if (sent > 0) await deps.saveSent(orgId, input.month, alerts)
  return { sent, alerts: alerts.length }
}
