/**
 * O Consultor: um laço Claude ⇄ ferramentas, igual para todo canal.
 *
 * Leitura roda aqui e o resultado volta ao Claude. Sugestão (ações antigas da
 * web) não roda: vai ao canal como botão. O canal cuida de histórico,
 * persistência e formato de saída; o agente, de limite, laço e ferramentas.
 */
import type { ChatMessage, ChatProvider, ToolCall, ToolResultBlock } from '@floow/core-finance'
import { ParametroInvalido, type ContextoFerramenta, type Ferramenta } from './ferramentas/tipos'
import type { ResultadoDoLimite } from './limite'

export const MAX_RODADAS = 5
export const TEXTO_SEM_CONCLUSAO = 'Não consegui concluir essa análise. Tente perguntar de forma mais específica.'

export interface EntradaDoAgente {
  orgId: string
  userId: string
  /** Só texto (ver `historicoParaOAgente`). */
  historico: ChatMessage[]
  mensagem: string
  system: string
  onTexto?: (texto: string) => void
  onSugestao?: (call: ToolCall) => void
}

export interface DepsDoAgente {
  provider: Pick<ChatProvider, 'streamChat'>
  ferramentas: Ferramenta[]
  consumirLimite: (orgId: string) => Promise<ResultadoDoLimite>
  log?: (msg: string, err?: unknown) => void
}

export type RespostaDoAgente =
  | { tipo: 'ok'; texto: string; sugestoes: ToolCall[] }
  | { tipo: 'limite'; texto: string; retryAfterSeconds: number }

const agora = () => new Date().toISOString()

export async function responder(e: EntradaDoAgente, deps: DepsDoAgente): Promise<RespostaDoAgente> {
  const limite = await deps.consumirLimite(e.orgId)
  if (!limite.allowed) {
    return {
      tipo: 'limite',
      retryAfterSeconds: limite.retryAfterSeconds,
      texto: `Limite de uso do consultor atingido. Tente de novo em ${limite.retryAfterSeconds}s.`,
    }
  }

  const porNome = new Map(deps.ferramentas.map((f) => [f.definicao.name, f]))
  const tools = deps.ferramentas.map((f) => f.definicao)
  const ctx: ContextoFerramenta = { orgId: e.orgId, userId: e.userId }
  const conversa: ChatMessage[] = [
    ...e.historico,
    { id: crypto.randomUUID(), role: 'user', content: e.mensagem, createdAt: agora() },
  ]
  const sugestoes: ToolCall[] = []
  let texto = ''
  let separar = false

  const emitir = (t: string) => {
    if (separar) {
      texto += '\n\n'
      e.onTexto?.('\n\n')
      separar = false
    }
    texto += t
    e.onTexto?.(t)
  }

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const r = await deps.provider.streamChat(conversa, {
      system: e.system,
      tools,
      onChunk: (c) => {
        if (c.type === 'text' && c.text) emitir(c.text)
      },
    })
    if (texto) separar = true
    if (r.toolCalls.length === 0) return { tipo: 'ok', texto, sugestoes }

    conversa.push({ id: crypto.randomUUID(), role: 'assistant', content: r.content, toolCalls: r.toolCalls, createdAt: agora() })
    const resultados: ToolResultBlock[] = []
    for (const call of r.toolCalls) resultados.push(await executar(call, porNome, ctx, sugestoes, e, deps))
    conversa.push({ id: crypto.randomUUID(), role: 'tool_result', content: '', toolResults: resultados, createdAt: agora() })
  }

  deps.log?.(`[consultor] estourou ${MAX_RODADAS} rodadas (org ${e.orgId})`)
  emitir(TEXTO_SEM_CONCLUSAO)
  return { tipo: 'ok', texto, sugestoes }
}

async function executar(
  call: ToolCall,
  porNome: Map<string, Ferramenta>,
  ctx: ContextoFerramenta,
  sugestoes: ToolCall[],
  e: EntradaDoAgente,
  deps: DepsDoAgente,
): Promise<ToolResultBlock> {
  const f = porNome.get(call.name)
  if (!f) return { toolUseId: call.id, content: `Ferramenta "${call.name}" não existe.`, isError: true }

  if (f.tipo === 'sugestao' || !f.executar) {
    sugestoes.push(call)
    e.onSugestao?.(call)
    return { toolUseId: call.id, content: 'Mostrado ao usuário como botão; ele decide se executa. Não diga que já foi feito.' }
  }

  try {
    return { toolUseId: call.id, content: await f.executar(ctx, call.params) }
  } catch (err) {
    if (err instanceof ParametroInvalido) {
      return { toolUseId: call.id, content: `Parâmetros inválidos: ${err.message}`, isError: true }
    }
    deps.log?.(`[consultor] ferramenta ${call.name} falhou`, err)
    return {
      toolUseId: call.id,
      content: 'Erro ao consultar os dados. Diga ao usuário que não conseguiu buscar essa informação agora.',
      isError: true,
    }
  }
}
