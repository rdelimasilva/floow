/**
 * Classificador de contraparte nova, via Claude. Uma chamada por importação,
 * com todos os grupos que o histórico não resolveu. Devolve a categoria e a
 * confiança; a fila só pré-seleciona (alta ou média) — ver `sugestao-da-fila.ts`.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod/v4'
import { isGenericCategory } from '@floow/core-finance'
import type { CategoriaDaOrg, GrupoPendente, RespostaDoClassificador } from './sugestao-da-fila'

const MODEL = 'claude-opus-5'

const Resposta = z.object({
  decisoes: z.array(
    z.object({
      id: z.string(),
      categoriaId: z.string().nullable(),
      confianca: z.enum(['alta', 'media', 'baixa']),
    }),
  ),
})

const SISTEMA = `Você classifica lançamentos bancários de um app de finanças pessoais brasileiro.

Recebe grupos de lançamentos de uma mesma contraparte (loja, empresa, pessoa) que chegaram do banco, e as categorias do usuário separadas por tipo (despesa ou receita). Para cada grupo, escolha a categoria do tipo do grupo que melhor descreve o gasto ou a receita, e diga sua confiança:

- "alta": a contraparte deixa claro o que é ("UBER *TRIP" em Transporte, "AIRBNB" em Hospedagem, "DROGASIL" em Farmácia). Só use "alta" quando qualquer pessoa concordaria.
- "media": provável, mas pode ser outra coisa.
- "baixa": não dá para saber. É o caso de nomes de pessoa, de maquininhas e intermediadores de pagamento genéricos, e de descrições vagas.

Use exatamente um id da lista (categoriaId), ou null se nenhuma servir. A categoria aparece pré-selecionada para o usuário confirmar; com confiança "baixa" ela não é mostrada. Responda uma decisão por grupo, usando o id do grupo.`

export function montarPedido(grupos: GrupoPendente[], categorias: CategoriaDaOrg[]) {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const lista = (type: 'expense' | 'income') =>
    categorias
      .filter((c) => c.type === type && !isGenericCategory(c))
      .map((c) => ({ id: c.id, nome: c.name, mae: c.parentId ? (porId.get(c.parentId)?.name ?? null) : null }))
  return {
    categorias_de_despesa: lista('expense'),
    categorias_de_receita: lista('income'),
    grupos: grupos.map((g) => ({
      id: g.counterpartyId,
      contraparte: g.displayName,
      tipo: g.nature === 'income' ? 'receita' : 'despesa',
      exemplos: [...new Set(g.descricoes)].slice(0, 3),
      lancamentos: g.count,
      total_reais: Math.abs(g.totalCents) / 100,
    })),
  }
}

/** Sem chave configurada devolve undefined: só o histórico classifica. */
export function createCounterpartyClassifier(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) return undefined
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })

  return async function classificar(
    grupos: GrupoPendente[],
    categorias: CategoriaDaOrg[],
  ): Promise<RespostaDoClassificador[]> {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(Resposta) },
      system: SISTEMA,
      messages: [{ role: 'user', content: JSON.stringify(montarPedido(grupos, categorias)) }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) return []
    return response.parsed_output.decisoes.map((d) => ({
      counterpartyId: d.id,
      categoryId: d.categoriaId,
      confianca: d.confianca,
    }))
  }
}
