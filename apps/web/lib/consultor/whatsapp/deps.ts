/**
 * Deps reais do consultor no WhatsApp: liga atenderNoWhatsApp ao banco (via
 * conversa.ts), ao Claude (agente.ts) e ao envio (send-whatsapp.ts).
 */
import { createAnthropicProvider } from '@floow/core-finance'
import { responder } from '@/lib/consultor/agente'
import { FERRAMENTAS } from '@/lib/consultor/ferramentas'
import { consumirLimiteDoConsultor } from '@/lib/consultor/limite'
import { montarPrompt } from '@/lib/consultor/prompt'
import { carregarDadosDoPrompt } from '@/lib/consultor/prompt-dados'
import { getAppUrl } from '@/lib/app-url'
import { marcarComoLidaDigitando, sendWhatsAppText } from '@/lib/notifications/send-whatsapp'
import { orgsDoWhatsApp, registrarPergunta, registrarResposta } from './conversa'
import type { DepsDoWhatsApp } from './atender'

/** Botão não existe no WhatsApp: as sugestões da web ficam de fora. */
export const FERRAMENTAS_WHATSAPP = FERRAMENTAS.filter((f) => f.tipo !== 'sugestao')

export function depsReaisDoWhatsApp(): DepsDoWhatsApp {
  const log = (msg: string, err?: unknown) => console.error(msg, err ?? '')
  return {
    orgsDoWhatsApp,
    registrarPergunta,
    registrarResposta,
    marcarDigitando: (wamid) => marcarComoLidaDigitando(wamid),
    enviar: (to, body) => sendWhatsAppText(to, body),
    montarSystem: async (orgId, userId) => montarPrompt(await carregarDadosDoPrompt(orgId, userId, 'whatsapp')),
    responder: async (e) => {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente')
      const provider = createAnthropicProvider({ apiKey, model: process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5', maxTokens: 8000 })
      // O route tem maxDuration de 60s e uma rodada pode levar até 30s; 20s
      // deixa folga para salvar no banco e enviar antes do corte da Vercel.
      return responder(e, { provider, ferramentas: FERRAMENTAS_WHATSAPP, consumirLimite: consumirLimiteDoConsultor, log, prazoMs: 20_000 })
    },
    appUrl: getAppUrl(),
    log,
  }
}
