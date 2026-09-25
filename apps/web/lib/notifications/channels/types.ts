import type { PacingSummary } from '../pacing-summary'
import type { PacingAlert } from '../pacing-alerts'
import type { Channel, Frequency } from '../schedule'
import type { SendResult } from '../send-whatsapp'

export type { SendResult }

export interface Recipient {
  userId: string
  email: string
  /** Só preenchido com número verificado. */
  whatsappPhone: string | null
  /** Já resolvidas: padrão aplicado e WhatsApp sem número = 'off'. */
  frequencies: Record<Channel, Frequency>
}

export interface ChannelMessage {
  kind: 'summary' | 'alert'
  orgId: string
  orgName: string
  /** YYYY-MM */
  month: string
  daysElapsed: number
  daysInMonth: number
  summary: PacingSummary
  /** Categorias que pioraram desde o último envio deste canal. */
  alerts: PacingAlert[]
  categoryNames: Record<string, string>
  pacingUrl: string
}

/** Um canal só formata e envia. Quem decide o que sai é o job. */
export interface ChannelAdapter {
  send(r: Recipient, m: ChannelMessage): Promise<SendResult>
}
