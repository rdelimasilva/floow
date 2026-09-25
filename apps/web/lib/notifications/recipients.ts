/**
 * Junta membros da org com as preferências gravadas e aplica os padrões.
 * Pura; a consulta fica em pacing-alerts-deps.ts.
 */
import { CHANNELS, resolveFrequency, type Channel, type Frequency } from './schedule'
import type { Recipient } from './channels/types'

export interface MemberRow {
  userId: string
  email: string
  whatsappPhone: string | null
  whatsappVerifiedAt: Date | null
}

export interface PrefRow {
  userId: string
  channel: Channel
  frequency: Frequency
}

export function mergeRecipients(members: MemberRow[], prefs: PrefRow[]): Recipient[] {
  return members
    .map((m) => {
      const verified = Boolean(m.whatsappPhone && m.whatsappVerifiedAt)
      const stored = (ch: Channel) =>
        prefs.find((p) => p.userId === m.userId && p.channel === ch)?.frequency
      const frequencies = Object.fromEntries(
        CHANNELS.map((ch) => [ch, resolveFrequency(ch, stored(ch), verified)]),
      ) as Record<Channel, Frequency>
      return {
        userId: m.userId,
        email: m.email,
        whatsappPhone: verified ? m.whatsappPhone : null,
        frequencies,
      }
    })
    .filter((r) => CHANNELS.some((ch) => r.frequencies[ch] !== 'off'))
}
