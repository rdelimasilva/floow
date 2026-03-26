import type { LLMProvider, SynthesisInput, SynthesisOutput } from '../types'
import { CFO_SYSTEM_PROMPT, buildSynthesisPrompt } from './prompts'

interface AnthropicConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
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

        const data = await response.json()
        const text = data.content?.[0]?.text ?? ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        return JSON.parse(jsonMatch[0]) as SynthesisOutput
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
