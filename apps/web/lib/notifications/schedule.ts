/**
 * Decide o que cada pessoa recebe hoje, por canal. Função pura.
 *
 * - daily: resumo todo dia
 * - weekly: resumo na segunda; nos outros dias, só se alguma categoria piorou
 * - alerts: só quando alguma categoria piorou (comportamento original do e-mail)
 * - off: nada
 */
import type { NotificationChannel, NotificationFrequency } from '@floow/db'

export type Channel = NotificationChannel
export type Frequency = NotificationFrequency
export type SendKind = 'summary' | 'alert' | 'none'

export const CHANNELS: readonly Channel[] = ['email', 'whatsapp']
export const FREQUENCIES: readonly Frequency[] = ['daily', 'weekly', 'alerts', 'off']

/** Vale quando não há linha em notification_preferences. */
export const DEFAULT_FREQUENCY: Record<Channel, Frequency> = { email: 'alerts', whatsapp: 'weekly' }

/** Segunda-feira (Date#getUTCDay). */
const SUMMARY_WEEKDAY = 1

export const isChannel = (x: unknown): x is Channel => CHANNELS.includes(x as Channel)
export const isFrequency = (x: unknown): x is Frequency => FREQUENCIES.includes(x as Frequency)

export function resolveFrequency(
  channel: Channel,
  stored: Frequency | undefined,
  whatsappVerified: boolean,
): Frequency {
  if (channel === 'whatsapp' && !whatsappVerified) return 'off'
  return stored ?? DEFAULT_FREQUENCY[channel]
}

/**
 * Dia da semana do dia `day` de `month` (YYYY-MM). Montado em UTC a partir do
 * dia já resolvido em America/Sao_Paulo, para não depender do fuso do servidor.
 */
export function weekdayOf(month: string, day: number): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay()
}

export function decideSend(frequency: Frequency, weekday: number, hasWorsening: boolean): SendKind {
  switch (frequency) {
    case 'daily':
      return 'summary'
    case 'weekly':
      if (weekday === SUMMARY_WEEKDAY) return 'summary'
      return hasWorsening ? 'alert' : 'none'
    case 'alerts':
      return hasWorsening ? 'alert' : 'none'
    default:
      return 'none'
  }
}
