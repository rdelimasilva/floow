import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAnthropicProvider } from '../../cfo/llm/anthropic'

/**
 * Síntese diária do CFO: não pode ficar presa a um modelo aposentado e,
 * quando a API recusa, o erro precisa dizer por quê (o synthesizer só loga).
 */
const INPUT = {
  insights: [],
  financialContext: {
    monthlyIncome: 0, monthlyExpenses: 0, netWorth: 0, debtTotal: 0,
    investmentTotal: 0, savingsRate: 0, topCategories: [],
  },
  locale: 'pt-BR',
}

afterEach(() => vi.unstubAllGlobals())

describe('createAnthropicProvider.synthesize', () => {
  it('usa o modelo atual do consultor por padrão', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: '{"prioritizedInsights":[],"dailySummary":"ok"}' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await createAnthropicProvider({ apiKey: 'k' }).synthesize(INPUT)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('claude-sonnet-5')
  })

  it('erro da API traz o corpo da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":{"type":"not_found_error","message":"model: x"}}',
    }))

    await expect(createAnthropicProvider({ apiKey: 'k' }).synthesize(INPUT))
      .rejects.toThrow(/404.*not_found_error/)
  })
})
