/** Monta o que a tela de Notificações mostra. Pura; a consulta fica na action. */
import { CHANNELS, resolveFrequency, type Channel, type Frequency } from './schedule'

export interface OrgNotificationRow {
  orgId: string
  orgName: string
  frequencies: Record<Channel, Frequency>
}

export interface NotificationSettings {
  /** Só o número verificado; pendente não aparece. */
  whatsappPhone: string | null
  whatsappVerified: boolean
  orgs: OrgNotificationRow[]
}

export function buildNotificationSettings(
  profile: { whatsappPhone: string | null; whatsappVerifiedAt: Date | null } | undefined,
  memberOrgs: { orgId: string; orgName: string }[],
  prefs: { orgId: string; channel: Channel; frequency: Frequency }[],
): NotificationSettings {
  const verified = Boolean(profile?.whatsappPhone && profile?.whatsappVerifiedAt)
  return {
    whatsappPhone: verified ? profile!.whatsappPhone : null,
    whatsappVerified: verified,
    orgs: memberOrgs.map(({ orgId, orgName }) => ({
      orgId,
      orgName,
      frequencies: Object.fromEntries(
        CHANNELS.map((ch) => [
          ch,
          resolveFrequency(ch, prefs.find((p) => p.orgId === orgId && p.channel === ch)?.frequency, verified),
        ]),
      ) as Record<Channel, Frequency>,
    })),
  }
}
