/**
 * O que fazer com uma mensagem de texto recebida no WhatsApp do floow.
 *
 * Primeiro a mensagem de vínculo ("floow XXXX-XXXX"), que vem de quem ainda
 * não está ligado. Depois, só para números verificados, o SAIR e, para
 * qualquer outra mensagem, o consultor (lib/consultor/whatsapp).
 */
import { phoneCandidatesFromWaId } from './phone'
import { isStopWord, maskPhone, type InboundText } from './whatsapp-webhook'
import { parseLinkMessage, type CompleteLinkResult } from './whatsapp-verification'
import type { SendResult } from './send-whatsapp'

export interface InboundDeps {
  /** Liga o número que enviou à conta dona do código (ver whatsapp-verification). */
  completeLink(waId: string, code: string): Promise<CompleteLinkResult>
  /** Só números verificados. */
  findUserByPhone(candidates: string[]): Promise<{ userId: string } | undefined>
  /** WhatsApp 'off' em todas as orgs do usuário. */
  turnOffWhatsApp(userId: string): Promise<void>
  /** Texto livre — permitido porque o usuário acabou de escrever (janela de 24h). */
  reply(to: string, body: string): Promise<SendResult>
  /** Mensagem comum de número verificado → consultor (lib/consultor/whatsapp). */
  consultar(userId: string, msg: InboundText): Promise<void>
  appUrl: string
}

export type InboundOutcome =
  | 'linked' | 'link_invalid' | 'link_already_linked' | 'link_in_use' | 'link_rate_limited'
  | 'unknown_sender' | 'stopped' | 'consultor'

const LINK_OUTCOME: Record<CompleteLinkResult, InboundOutcome> = {
  linked: 'linked',
  invalid: 'link_invalid',
  in_use: 'link_in_use',
  rate_limited: 'link_rate_limited',
}

async function reply(deps: InboundDeps, waId: string, body: string): Promise<void> {
  const r = await deps.reply(`+${waId}`, body)
  if (!r.ok) console.error(`[whatsapp] resposta falhou para ${maskPhone(waId)}: ${r.error}`)
}

export async function handleInboundText(msg: InboundText, deps: InboundDeps): Promise<InboundOutcome> {
  const settingsUrl = `${deps.appUrl}/settings`

  const code = parseLinkMessage(msg.text)
  if (code) {
    const result = await deps.completeLink(msg.from, code)
    // Limite estourado: silêncio. Responder daria a quem tenta códigos em
    // série um sinal (e uma mensagem nossa paga) a cada tentativa.
    if (result === 'linked') {
      await reply(deps, msg.from, 'Pronto! Seu WhatsApp está ligado ao floow. Você vai receber o ritmo de gastos por aqui. Para parar, responda SAIR.')
    } else if (result === 'invalid') {
      // A Meta às vezes entrega a mesma mensagem duas vezes: a segunda já não
      // acha o código (uso único). Se o número já está ligado, não assusta a
      // pessoa com "código inválido" logo depois do "Pronto!".
      if (await deps.findUserByPhone(phoneCandidatesFromWaId(msg.from))) {
        await reply(deps, msg.from, 'Seu WhatsApp já está ligado ao floow.')
        return 'link_already_linked'
      }
      await reply(deps, msg.from, `Código inválido ou expirado. Gere outro em Configurações: ${settingsUrl}`)
    } else if (result === 'in_use') {
      await reply(deps, msg.from, 'Este número já está ligado a outra conta do floow. Se não foi você, fale com o suporte.')
    }
    return LINK_OUTCOME[result]
  }

  const user = await deps.findUserByPhone(phoneCandidatesFromWaId(msg.from))
  if (!user) return 'unknown_sender'

  if (isStopWord(msg.text)) {
    await deps.turnOffWhatsApp(user.userId)
    await reply(
      deps,
      msg.from,
      `Pronto: você não vai mais receber o ritmo de gastos por aqui, em nenhuma conta. Para religar, vá em Configurações: ${settingsUrl}`,
    )
    return 'stopped'
  }

  await deps.consultar(user.userId, msg)
  return 'consultor'
}
