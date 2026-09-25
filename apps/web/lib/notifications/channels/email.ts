import { buildPacingEmail } from '../pacing-email'
import { buildPacingSummaryEmail } from '../pacing-summary-email'
import { signUnsubscribeToken } from '../unsubscribe-token'
import type { SendEmailInput, SendEmailResult } from '../send-email'
import type { ChannelAdapter } from './types'

export function createEmailChannel(deps: {
  appUrl: string
  secret: string | undefined
  send: (input: SendEmailInput) => Promise<SendEmailResult>
}): ChannelAdapter {
  return {
    async send(r, m) {
      const token = signUnsubscribeToken(r.userId, deps.secret, m.orgId)
      const unsubscribeUrl = `${deps.appUrl}/api/email/unsubscribe?token=${token}`
      const email =
        m.kind === 'alert'
          ? buildPacingEmail({
              orgName: m.orgName,
              month: m.month,
              daysElapsed: m.daysElapsed,
              daysInMonth: m.daysInMonth,
              alerts: m.alerts,
              categoryNames: m.categoryNames,
              pacingUrl: m.pacingUrl,
              unsubscribeUrl,
            })
          : buildPacingSummaryEmail(m.summary, unsubscribeUrl)
      return deps.send({ to: r.email, ...email, unsubscribeUrl })
    },
  }
}
