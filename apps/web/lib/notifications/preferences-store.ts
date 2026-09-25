/**
 * Escrita de preferência de notificação, sempre dentro de uma transação sob
 * RLS (withUserDb/withUserDbFor). NÃO é 'use server': recebe userId, e uma
 * server action com userId de parâmetro deixaria o cliente escolher o usuário.
 */
import { notificationPreferences, orgMembers, type RlsTx } from '@floow/db'
import { eq, sql } from 'drizzle-orm'
import type { Channel, Frequency } from './schedule'

export async function listUserOrgIds(tx: RlsTx, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
  return rows.map((r) => r.orgId)
}

export async function upsertFrequency(
  tx: RlsTx,
  userId: string,
  orgIds: string[],
  channel: Channel,
  frequency: Frequency,
): Promise<void> {
  if (orgIds.length === 0) return
  await tx
    .insert(notificationPreferences)
    .values(orgIds.map((orgId) => ({ orgId, userId, channel, frequency, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [notificationPreferences.orgId, notificationPreferences.userId, notificationPreferences.channel],
      set: { frequency: sql`excluded.frequency`, updatedAt: sql`now()` },
    })
}
