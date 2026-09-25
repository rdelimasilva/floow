/**
 * O que fazer com uma mensagem de texto recebida no WhatsApp do floow.
 *
 * FASE 2: o agente conversacional entra aqui, no lugar da resposta padrão.
 * Ele recebe o userId já identificado pelo número verificado. Nesta fase só
 * existe o SAIR e um aviso.
 */
import { phoneCandidatesFromWaId } from './phone'
import { isStopWord, type InboundText } from './whatsapp-webhook'
import type { SendResult } from './send-whatsapp'

export interface InboundDeps {
  /** Só números verificados. */
  findUserByPhone(candidates: string[]): Promise<{ userId: string } | undefined>
  /** WhatsApp 'off' em todas as orgs do usuário. */
  turnOffWhatsApp(userId: string): Promise<void>
  /** Texto livre — permitido porque o usuário acabou de escrever (janela de 24h). */
  reply(to: string, body: string): Promise<SendResult>
  appUrl: string
}

export type InboundOutcome = 'unknown_sender' | 'stopped' | 'default_reply'

export async function handleInboundText(msg: InboundText, deps: InboundDeps): Promise<InboundOutcome> {
  const user = await deps.findUserByPhone(phoneCandidatesFromWaId(msg.from))
  if (!user) return 'unknown_sender'

  const to = `+${msg.from}`
  const settingsUrl = `${deps.appUrl}/settings`

  if (isStopWord(msg.text)) {
    await deps.turnOffWhatsApp(user.userId)
    await deps.reply(
      to,
      `Pronto: você não vai mais receber o ritmo de gastos por aqui, em nenhuma conta. Para religar, vá em Configurações: ${settingsUrl}`,
    )
    return 'stopped'
  }

  await deps.reply(to, `Por enquanto eu só mando o ritmo de gastos. Ajuste em Configurações: ${settingsUrl}`)
  return 'default_reply'
}
