/**
 * Implementação real (Drizzle + Resend) das dependências do job de e-mail de
 * ritmo. Separada do job para ele ser testável sem banco.
 */
import { getDb, orgs, orgMembers, profiles, pacingAlertState } from '@floow/db'
import { and, eq, sql } from 'drizzle-orm'
import type { PacingStatus } from '@floow/core-finance'
import { buildBudgetPacingInput } from '@/lib/cfo/budget-pacing-input'
import { sendEmail } from './send-email'
import type { PacingEmailDeps } from './pacing-email-job'

export function defaultPacingEmailDeps(): PacingEmailDeps {
  const db = getDb()
  return {
    loadPacing: buildBudgetPacingInput,

    async loadLastSent(orgId, month) {
      const rows = await db
        .select({ categoryId: pacingAlertState.categoryId, status: pacingAlertState.status })
        .from(pacingAlertState)
        .where(and(eq(pacingAlertState.orgId, orgId), eq(pacingAlertState.month, month)))
      return Object.fromEntries(rows.map((r) => [r.categoryId, r.status as PacingStatus]))
    },

    async loadRecipients(orgId) {
      return db
        .select({ userId: profiles.id, email: profiles.email })
        .from(orgMembers)
        .innerJoin(profiles, eq(profiles.id, orgMembers.userId))
        .where(and(eq(orgMembers.orgId, orgId), eq(profiles.emailPacingAlerts, true)))
    },

    async loadOrgName(orgId) {
      const [row] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId))
      return row?.name ?? 'sua conta'
    },

    send: (input) => sendEmail(input),

    async saveSent(orgId, month, alerts) {
      await db
        .insert(pacingAlertState)
        .values(alerts.map((a) => ({ orgId, month, categoryId: a.categoryId, status: a.status })))
        .onConflictDoUpdate({
          target: [pacingAlertState.orgId, pacingAlertState.month, pacingAlertState.categoryId],
          set: { status: sql`excluded.status`, sentAt: sql`now()` },
        })
    },

    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    secret: process.env.CRON_SECRET,
  }
}
