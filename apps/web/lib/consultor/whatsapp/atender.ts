/**
 * Uma mensagem de texto no WhatsApp → resposta do consultor.
 *
 * Mesmo agente da web (responder), com canal 'whatsapp'. As deps chegam
 * injetadas: o arquivo não conhece banco, Meta nem Claude.
 */
import type { ChatMessage } from '@floow/core-finance'
import type { EntradaDoAgente, RespostaDoAgente } from '@/lib/consultor/agente'
import type { SendResult } from '@/lib/notifications/send-whatsapp'
import { maskPhone } from '@/lib/notifications/whatsapp-webhook'
import { dividirMensagem, escolherOrgDoWhatsApp } from './puras'

export const TEXTO_ESCOLHER_ORG = (appUrl: string) =>
  `Você tem mais de uma organização no floow. Escolha qual o consultor usa no WhatsApp em Configurações: ${appUrl}/settings`
export const TEXTO_SEM_ORG = 'Não encontrei uma organização sua no floow.'
export const TEXTO_INDISPONIVEL = 'O consultor está indisponível agora. Tente de novo em instantes.'

export interface DepsDoWhatsApp {
  orgsDoWhatsApp(userId: string): Promise<{ orgIds: string[]; preferida: string | null }>
  registrarPergunta(p: { userId: string; orgId: string; texto: string; wamid?: string }): Promise<{ conversaId: string; historico: ChatMessage[] } | null>
  registrarResposta(p: { userId: string; conversaId: string; texto: string }): Promise<void>
  marcarDigitando(wamid: string): Promise<unknown>
  enviar(to: string, body: string): Promise<SendResult>
  montarSystem(orgId: string, userId: string): Promise<string>
  responder(e: Omit<EntradaDoAgente, 'onTexto' | 'onSugestao'>): Promise<RespostaDoAgente>
  appUrl: string
  log(msg: string, err?: unknown): void
}

export type ResultadoNoWhatsApp = 'respondido' | 'limite' | 'escolher-org' | 'sem-org' | 'repetida' | 'erro'

export async function atenderNoWhatsApp(
  m: { userId: string; waId: string; texto: string; wamid?: string },
  deps: DepsDoWhatsApp,
): Promise<ResultadoNoWhatsApp> {
  const para = `+${m.waId}`
  const enviar = async (texto: string) => {
    for (const parte of dividirMensagem(texto)) {
      const r = await deps.enviar(para, parte)
      if (!r.ok) deps.log(`[consultor] envio falhou para ${maskPhone(m.waId)}: ${r.error}`)
    }
  }

  try {
    const { orgIds, preferida } = await deps.orgsDoWhatsApp(m.userId)
    const org = escolherOrgDoWhatsApp(orgIds, preferida)
    if (org.tipo === 'escolher') {
      await enviar(TEXTO_ESCOLHER_ORG(deps.appUrl))
      return 'escolher-org'
    }
    if (org.tipo === 'sem-org') {
      await enviar(TEXTO_SEM_ORG)
      return 'sem-org'
    }

    const pergunta = await deps.registrarPergunta({ userId: m.userId, orgId: org.orgId, texto: m.texto, wamid: m.wamid })
    if (!pergunta) return 'repetida'

    if (m.wamid) {
      // Só conforto visual: nunca espera, mesmo que a Meta demore ou recuse.
      void deps
        .marcarDigitando(m.wamid)
        .then((r) => {
          if (r && typeof r === 'object' && 'ok' in r && !(r as { ok: boolean }).ok) deps.log('[consultor] digitando falhou', r)
        })
        .catch((err) => deps.log('[consultor] digitando falhou', err))
    }

    const r = await deps.responder({
      orgId: org.orgId,
      userId: m.userId,
      canal: 'whatsapp',
      historico: pergunta.historico,
      mensagem: m.texto,
      system: await deps.montarSystem(org.orgId, m.userId),
    })
    if (r.tipo === 'limite') {
      await enviar(r.texto)
      return 'limite'
    }
    // A resposta chega ao usuário mesmo que gravar no banco falhe depois.
    await enviar(r.texto)
    try {
      await deps.registrarResposta({ userId: m.userId, conversaId: pergunta.conversaId, texto: r.texto })
    } catch (err) {
      deps.log('[consultor] falha ao salvar a resposta', err)
    }
    return 'respondido'
  } catch (err) {
    deps.log(`[consultor] falha no WhatsApp de ${maskPhone(m.waId)}`, err)
    await enviar(TEXTO_INDISPONIVEL)
    return 'erro'
  }
}
