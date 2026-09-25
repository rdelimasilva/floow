'use server'
import { orgs, orgMembers, profiles, notificationPreferences } from '@floow/db'
import { asc, eq } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'
import { upsertFrequency } from './preferences-store'
import { isChannel, isFrequency } from './schedule'
import { buildNotificationSettings, type NotificationSettings } from './notification-settings'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Preferências do usuário logado. A chave é o `sub` verificado, nunca um id do cliente. */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const userId = await requireUserId()
  return withUserDb(async (tx) => {
    const [profile] = await tx
      .select({ whatsappPhone: profiles.whatsappPhone, whatsappVerifiedAt: profiles.whatsappVerifiedAt })
      .from(profiles)
      .where(eq(profiles.id, userId))
    const memberOrgs = await tx
      .select({ orgId: orgs.id, orgName: orgs.name })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId))
      .orderBy(asc(orgs.name))
    const prefs = await tx
      .select({
        orgId: notificationPreferences.orgId,
        channel: notificationPreferences.channel,
        frequency: notificationPreferences.frequency,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
    return buildNotificationSettings(profile, memberOrgs, prefs)
  })
}

/**
 * Grava a frequência de um canal numa org. O RLS garante que o usuário é
 * membro da org (policy de INSERT/UPDATE de notification_preferences).
 */
export async function setNotificationFrequency(
  orgId: string,
  channel: string,
  frequency: string,
): Promise<void> {
  const userId = await requireUserId()
  if (!UUID.test(orgId) || !isChannel(channel) || !isFrequency(frequency)) {
    throw new Error('Preferência inválida')
  }
  await withUserDb((tx) => upsertFrequency(tx, userId, [orgId], channel, frequency))
}
