import { describe, it, expect } from 'vitest'
import { toAnthropicMessages } from '../../cfo/llm/anthropic-messages'
import type { ChatMessage } from '../../cfo/types'

const base = { id: 'x', createdAt: '2026-09-28T00:00:00Z' }

describe('toAnthropicMessages', () => {
  it('texto simples passa como string', () => {
    expect(toAnthropicMessages([{ ...base, role: 'user', content: 'oi' }])).toEqual([{ role: 'user', content: 'oi' }])
  })

  it('assistente com toolCalls vira blocos text + tool_use', () => {
    const m: ChatMessage = {
      ...base, role: 'assistant', content: 'Vou olhar.',
      toolCalls: [{ id: 't1', name: 'saldos_das_contas', params: {} }],
    }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'assistant',
      content: [
        { type: 'text', text: 'Vou olhar.' },
        { type: 'tool_use', id: 't1', name: 'saldos_das_contas', input: {} },
      ],
    }])
  })

  it('assistente só com tool_use não manda bloco de texto vazio', () => {
    const m: ChatMessage = { ...base, role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'a', params: { x: 1 } }] }
    expect(toAnthropicMessages([m])[0].content).toEqual([{ type: 'tool_use', id: 't1', name: 'a', input: { x: 1 } }])
  })

  it('toolResults vira um user com um tool_result por bloco, com is_error só quando erro', () => {
    const m: ChatMessage = {
      ...base, role: 'tool_result', content: '',
      toolResults: [
        { toolUseId: 't1', content: 'ok' },
        { toolUseId: 't2', content: 'falhou', isError: true },
      ],
    }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
        { type: 'tool_result', tool_use_id: 't2', content: 'falhou', is_error: true },
      ],
    }])
  })

  it('tool_result antigo (toolCall único) mantém o formato de antes', () => {
    const m: ChatMessage = { ...base, role: 'tool_result', content: 'feito', toolCall: { id: 't9', name: 'create_budget', params: {} } }
    expect(toAnthropicMessages([m])).toEqual([{
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't9', content: 'feito' }],
    }])
  })
})
