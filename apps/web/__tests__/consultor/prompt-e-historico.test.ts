import { describe, it, expect } from 'vitest'
import type { ChatMessage } from '@floow/core-finance'
import { montarPrompt, type DadosDoPrompt } from '@/lib/consultor/prompt'
import { historicoParaOAgente } from '@/lib/consultor/historico'

const dados: DadosDoPrompt = {
  canal: 'web', hoje: '2026-09-28',
  contas: ['Itaú', 'Nubank'], categorias: ['Mercado', 'Lazer'],
  insights: [{ severity: 'warning', title: 'Delivery alto', body: 'Subiu 40%' }],
}

describe('montarPrompt', () => {
  it('traz a data de hoje, contas, categorias e insights', () => {
    const p = montarPrompt(dados)
    expect(p).toContain('Hoje é 2026-09-28')
    expect(p).toContain('Itaú, Nubank')
    expect(p).toContain('Mercado, Lazer')
    expect(p).toContain('[warning] Delivery alto: Subiu 40%')
  })

  it('exige que todo número venha de ferramenta', () => {
    expect(montarPrompt(dados)).toContain('Todo número que você citar vem de uma ferramenta')
  })

  it('formato muda com o canal', () => {
    expect(montarPrompt(dados)).toContain('markdown')
    expect(montarPrompt({ ...dados, canal: 'whatsapp' })).toContain('*negrito*')
    expect(montarPrompt({ ...dados, canal: 'whatsapp' })).not.toContain('markdown')
  })

  it('insight em discussão entra com os dados', () => {
    const p = montarPrompt({ ...dados, insight: { type: 't', severity: 'critical', title: 'Caixa negativo', body: 'b', metric: { x: 1 } } })
    expect(p).toContain('## Insight em discussão')
    expect(p).toContain('Caixa negativo')
    expect(p).toContain('{"x":1}')
  })
})

describe('historicoParaOAgente', () => {
  const m = (role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id: crypto.randomUUID(), role, content, createdAt: '2026-09-28T00:00:00Z', ...extra })

  it('fica só com texto de usuário e assistente, sem tool_result nem tool_call antigos', () => {
    const r = historicoParaOAgente([
      m('user', 'cria orçamento'),
      m('assistant', 'Sugiro R$ 500', { toolCall: { id: 't', name: 'create_budget', params: {} } }),
      m('tool_result', 'Orçamento criado', { toolCall: { id: 't', name: 'create_budget', params: {} } }),
      m('assistant', ''),
      m('user', 'valeu'),
    ])
    expect(r.map((x) => [x.role, x.content])).toEqual([
      ['user', 'cria orçamento'],
      ['assistant', 'Sugiro R$ 500'],
      ['user', 'valeu'],
    ])
    expect(r[1].toolCall).toBeUndefined()
  })
})
