import type { ChatMessage } from '../types'

type Bloco =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Bloco[]
}

/**
 * Histórico do floow → formato da API da Anthropic.
 *
 * O laço de ferramentas exige reenviar os blocos tool_use do assistente e os
 * tool_result com o mesmo id; só texto, a API recusa o tool_result órfão.
 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  return messages.map((m): AnthropicMessage => {
    if (m.role === 'tool_result') {
      if (m.toolResults?.length) {
        return {
          role: 'user',
          content: m.toolResults.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.toolUseId,
            content: r.content,
            ...(r.isError ? { is_error: true } : {}),
          })),
        }
      }
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCall!.id, content: m.content }] }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      const blocos: Bloco[] = m.content ? [{ type: 'text', text: m.content }] : []
      for (const c of m.toolCalls) blocos.push({ type: 'tool_use', id: c.id, name: c.name, input: c.params })
      return { role: 'assistant', content: blocos }
    }
    return { role: m.role, content: m.content }
  })
}
