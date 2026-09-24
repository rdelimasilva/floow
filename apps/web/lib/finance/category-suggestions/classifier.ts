/**
 * Classificador das sugestões de categoria, via Claude.
 *
 * O motor agrupa e soma; não sabe o que o gasto é. "PIX para Maraisa" pode ser
 * diarista, aluguel ou presente, e o nome da pessoa não é categoria. Aqui o
 * Claude recebe só a lista já agregada (exemplos de descrição, quantidade,
 * total) e as categorias existentes, e decide: mover para uma existente, criar
 * uma com nome que faça sentido, ou ignorar. Uma chamada por rodada.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import {
  isGenericCategory,
  type CategorySuggestion,
  type SuggestionCategory,
  type SuggestionDecision,
} from '@floow/core-finance'

const MODEL = 'claude-opus-5'

const Resposta = z.object({
  decisoes: z.array(
    z.object({
      id: z.string(),
      acao: z.enum(['existente', 'nova', 'ignorar']),
      categoriaId: z.string().nullable(),
      nome: z.string().nullable(),
    }),
  ),
})

const SISTEMA = `Você organiza as categorias de gasto de um app de finanças pessoais brasileiro.

Recebe grupos de lançamentos que o app não soube classificar e a lista de categorias de despesa que o usuário já tem. Para cada grupo, decida uma ação:

- "existente": o grupo claramente pertence a uma categoria da lista. Informe categoriaId (exatamente um id da lista). Prefira esta opção sempre que houver uma categoria adequada.
- "nova": nenhuma categoria da lista serve, mas dá para dizer com segurança que tipo de gasto é. Informe nome: curto (1 a 3 palavras), em português, descrevendo o tipo de gasto ("Delivery", "Streaming", "Farmácia", "Academia"). Nunca use nome de pessoa, de loja ou de banco como nome de categoria.
- "ignorar": não dá para saber o que é o gasto com segurança. É o caso comum de PIX ou TED para uma pessoa física sem outra pista, de transferência entre contas do próprio usuário, de investimento, de pagamento de fatura ou de empréstimo.

Na dúvida, ignore: uma sugestão errada é pior que nenhuma. Responda uma decisão para cada grupo, usando o id do grupo.`

interface GrupoParaClaude {
  id: string
  onde: string
  exemplos: string[]
  lancamentos: number
  total_reais: number
  media_mensal_reais: number
}

export function montarPedido(pending: CategorySuggestion[], categories: SuggestionCategory[]) {
  const porId = new Map(categories.map((c) => [c.id, c]))
  const categorias = categories
    .filter((c) => !isGenericCategory(c))
    .map((c) => ({ id: c.id, nome: c.name, mae: c.parentId ? (porId.get(c.parentId)?.name ?? null) : null }))
  const grupos: GrupoParaClaude[] = pending.map((s) => ({
    id: s.fingerprint,
    onde:
      s.kind === 'split'
        ? `dentro da categoria "${porId.get(s.sourceCategoryIds[0])?.name ?? '?'}" (possível subcategoria)`
        : 'sem categoria ou em categoria genérica ("Outros")',
    exemplos: s.samples,
    lancamentos: s.txCount,
    total_reais: Math.round(s.totalCents) / 100,
    media_mensal_reais: Math.round(s.monthlyAvgCents) / 100,
  }))
  return { categorias, grupos }
}

export function traduzirDecisoes(resposta: z.infer<typeof Resposta>): SuggestionDecision[] {
  const saida: SuggestionDecision[] = []
  for (const d of resposta.decisoes) {
    if (d.acao === 'existente' && d.categoriaId) saida.push({ fingerprint: d.id, action: 'existing', categoryId: d.categoriaId })
    else if (d.acao === 'nova' && d.nome) saida.push({ fingerprint: d.id, action: 'new', name: d.nome })
    else saida.push({ fingerprint: d.id, action: 'ignore' })
  }
  return saida
}

/** Sem chave configurada devolve undefined: o job segue só com o que o motor resolveu. */
export function createClaudeClassifier(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) return undefined
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })

  return async function classify(
    pending: CategorySuggestion[],
    categories: SuggestionCategory[],
  ): Promise<SuggestionDecision[]> {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(Resposta) },
      system: SISTEMA,
      messages: [{ role: 'user', content: JSON.stringify(montarPedido(pending, categories)) }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) return []
    return traduzirDecisoes(response.parsed_output)
  }
}
