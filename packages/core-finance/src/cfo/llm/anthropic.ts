import type { ChatProvider, ChatMessage, ChatTool, ChatStreamChunk, ChatResponse, SynthesisInput, SynthesisOutput } from '../types'
import { CFO_SYSTEM_PROMPT, buildSynthesisPrompt } from './prompts'

interface AnthropicConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export function createAnthropicProvider(config: AnthropicConfig): ChatProvider {
  const model = config.model ?? 'claude-sonnet-4-20250514'
  const maxTokens = config.maxTokens ?? 2000
  const timeoutMs = config.timeoutMs ?? 15000

  return {
    async synthesize(input: SynthesisInput): Promise<SynthesisOutput> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system: CFO_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: buildSynthesisPrompt(
                  JSON.stringify(input.insights),
                  JSON.stringify(input.financialContext),
                ),
              },
            ],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        const data = await response.json() as { content?: { text?: string }[] }
        const text = data.content?.[0]?.text ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        return JSON.parse(jsonMatch[0]) as SynthesisOutput
      } finally {
        clearTimeout(timer)
      }
    },

    async streamChat(
      messages: ChatMessage[],
      options: {
        system: string
        tools?: ChatTool[]
        onChunk: (chunk: ChatStreamChunk) => void
      }
    ): Promise<ChatResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30000)

      try {
        // Convert ChatMessage[] to Anthropic format
        const anthropicMessages = messages.map((m) => {
          if (m.role === 'tool_result') {
            return {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result' as const,
                  tool_use_id: m.toolCall!.id,
                  content: m.content,
                },
              ],
            }
          }
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        })

        // Convert ChatTool[] to Anthropic format
        const anthropicTools = options.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }))

        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          system: options.system,
          messages: anthropicMessages,
          stream: true,
        }
        if (anthropicTools && anthropicTools.length > 0) {
          body.tools = anthropicTools
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        if (!response.body) {
          throw new Error('No response body for streaming')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        let fullText = ''
        const toolCalls: ChatResponse['toolCalls'] = []

        // State for building tool use blocks
        let currentToolId: string | null = null
        let currentToolName: string | null = null
        let currentToolInputJson = ''

        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const dataStr = line.slice(6).trim()
            if (!dataStr || dataStr === '[DONE]') continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(dataStr)
            } catch {
              continue
            }

            const eventType = event.type as string

            if (eventType === 'content_block_start') {
              const block = event.content_block as Record<string, unknown>
              if (block?.type === 'tool_use') {
                currentToolId = block.id as string
                currentToolName = block.name as string
                currentToolInputJson = ''
              }
            } else if (eventType === 'content_block_delta') {
              const delta = event.delta as Record<string, unknown>
              if (delta?.type === 'text_delta') {
                const text = delta.text as string
                fullText += text
                options.onChunk({ type: 'text', text })
              } else if (delta?.type === 'input_json_delta') {
                currentToolInputJson += delta.partial_json as string
              }
            } else if (eventType === 'content_block_stop') {
              if (currentToolId && currentToolName) {
                let params: Record<string, unknown> = {}
                try {
                  params = JSON.parse(currentToolInputJson)
                } catch {
                  params = {}
                }
                const toolCall = {
                  id: currentToolId,
                  name: currentToolName,
                  params,
                }
                toolCalls.push(toolCall)
                options.onChunk({ type: 'tool_call', toolCall })
                currentToolId = null
                currentToolName = null
                currentToolInputJson = ''
              }
            } else if (eventType === 'message_stop') {
              options.onChunk({ type: 'done' })
            }
          }
        }

        return {
          content: fullText,
          toolCalls,
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
