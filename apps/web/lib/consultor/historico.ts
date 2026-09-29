import type { ChatMessage } from '@floow/core-finance'

/**
 * Histórico salvo → o que o agente reenvia ao Claude: só texto.
 *
 * As rodadas de ferramenta não são salvas, e o tool_result antigo (clique no
 * botão) não tem o tool_use correspondente no histórico — a API recusaria.
 * Se precisar do número de novo, o Claude consulta de novo.
 */
export function historicoParaOAgente(msgs: ChatMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim() !== '')
    .map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt }))
}
