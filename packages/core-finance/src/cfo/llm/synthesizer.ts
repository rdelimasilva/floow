import type { InsightResult, LLMProvider, SynthesisInput, SynthesisOutput } from '../types'

export async function synthesizeInsights(
  provider: LLMProvider,
  insights: InsightResult[],
  financialContext: SynthesisInput['financialContext'],
  locale = 'pt-BR',
): Promise<{ synthesized: SynthesisOutput } | null> {
  if (insights.length === 0) return null

  try {
    const output = await provider.synthesize({
      insights,
      financialContext,
      locale,
    })

    if (
      !output.prioritizedInsights ||
      !Array.isArray(output.prioritizedInsights) ||
      output.prioritizedInsights.length !== insights.length
    ) {
      console.error('[CFO/LLM] Output mismatch: expected', insights.length, 'got', output.prioritizedInsights?.length)
      return null
    }

    return { synthesized: output }
  } catch (err) {
    console.error('[CFO/LLM] Synthesis failed:', err)
    return null
  }
}
