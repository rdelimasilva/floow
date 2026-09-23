'use server'
import { profiles } from '@floow/db'
import { eq } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/session'
import { withUserDb } from '@/lib/db/rls'

/** Preferência do usuário logado. A chave é o `sub` verificado, nunca um id do cliente. */
export async function getPacingEmailPreference(): Promise<boolean> {
  const userId = await requireUserId()
  const [row] = await withUserDb((tx) =>
    tx.select({ enabled: profiles.emailPacingAlerts }).from(profiles).where(eq(profiles.id, userId)),
  )
  return row?.enabled ?? true
}

export async function setPacingEmailPreference(enabled: boolean): Promise<void> {
  const userId = await requireUserId()
  await withUserDb((tx) =>
    tx
      .update(profiles)
      .set({ emailPacingAlerts: enabled === true, updatedAt: new Date() })
      .where(eq(profiles.id, userId)),
  )
}
