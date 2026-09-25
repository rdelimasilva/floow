/**
 * Implementação real (Drizzle + Resend + Meta) das dependências do job de
 * ritmo. Separada do job para ele ser testável sem banco.
 */
import {
  getDb, orgs, orgMembers, profiles, pacingAlertState, notificationPreferences,
} from '@floow/db'
import { and, eq, sql } from 'drizzle-orm'
import type { PacingStatus } from '@floow/core-finance'
import { buildBudgetPacingInput } from '@/lib/cfo/budget-pacing-input'
import { getAppUrl } from '@/lib/app-url'
import { sendEmail } from './send-email'
import { sendWhatsAppTemplate } from './send-whatsapp'
import { createEmailChannel } from './channels/email'
import { createWhatsAppChannel } from './channels/whatsapp'
import { mergeRecipients } from './recipients'
import type { Channel } from './schedule'
import type { PacingAlertsDeps } from './pacing-alerts-job'

export function defaultPacingAlertsDeps(): PacingAlertsDeps {
  const db = getDb()
  const appUrl = getAppUrl()
  return {
    loadPacing: buildBudgetPacingInput,

    async loadLastSent(orgId, month) {
      const rows = await db
        .select({
          categoryId: pacingAlertState.categoryId,
          status: pacingAlertState.status,
          channel: pacingAlertState.channel,
        })
        .from(pacingAlertState)
        .where(and(eq(pacingAlertState.orgId, orgId), eq(pacingAlertState.month, month)))
      const out: Record<Channel, Record<string, PacingStatus>> = { email: {}, whatsapp: {} }
      for (const r of rows) out[r.channel][r.categoryId] = r.status as PacingStatus
      return out
    },

    async loadRecipients(orgId) {
      const members = await db
        .select({
          userId: profiles.id,
          email: profiles.email,
          whatsappPhone: profiles.whatsappPhone,
          whatsappVerifiedAt: profiles.whatsappVerifiedAt,
        })
        .from(orgMembers)
        .innerJoin(profiles, eq(profiles.id, orgMembers.userId))
        .where(eq(orgMembers.orgId, orgId))
      const prefs = await db
        .select({
          userId: notificationPreferences.userId,
          channel: notificationPreferences.channel,
          frequency: notificationPreferences.frequency,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.orgId, orgId))
      return mergeRecipients(members, prefs)
    },

    async loadOrgName(orgId) {
      const [row] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId))
      return row?.name ?? 'sua conta'
    },

    async saveSent(orgId, month, channel, alerts) {
      await db
        .insert(pacingAlertState)
        .values(alerts.map((a) => ({ orgId, month, categoryId: a.categoryId, status: a.status, channel })))
        .onConflictDoUpdate({
          target: [
            pacingAlertState.orgId, pacingAlertState.month,
            pacingAlertState.categoryId, pacingAlertState.channel,
          ],
          set: { status: sql`excluded.status`, sentAt: sql`now()` },
        })
    },

    channels: {
      email: createEmailChannel({ appUrl, secret: process.env.CRON_SECRET, send: (i) => sendEmail(i) }),
      whatsapp: createWhatsAppChannel({ sendTemplate: (m) => sendWhatsAppTemplate(m) }),
    },
    appUrl,
  }
}
