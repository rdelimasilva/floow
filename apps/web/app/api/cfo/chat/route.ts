import { NextResponse } from 'next/server'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { createAnthropicProvider } from '@floow/core-finance'
import type { ChatMessage, ChatStreamChunk } from '@floow/core-finance'
import { getConversationMessages, getConversation } from '@/lib/cfo/chat-queries'
import { createConversation, saveMessage } from '@/lib/cfo/chat-actions'
import { cfoInsights } from '@floow/db'
import { withUserDb } from '@/lib/db/rls'
import { eq, and } from 'drizzle-orm'
import { responder } from '@/lib/consultor/agente'
import { FERRAMENTAS } from '@/lib/consultor/ferramentas'
import { consumirLimiteDoConsultor } from '@/lib/consultor/limite'
import { montarPrompt } from '@/lib/consultor/prompt'
import { carregarDadosDoPrompt } from '@/lib/consultor/prompt-dados'
import { historicoParaOAgente } from '@/lib/consultor/historico'

/** Até 5 rodadas de ferramenta, cada chamada ao Claude com até 30 s. */
export const maxDuration = 60

const INDISPONIVEL = 'O consultor está indisponível agora. Tente de novo em instantes.'

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = identity.userId

  let orgId: string
  try {
    orgId = await getOrgId()
  } catch {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Chat not configured' }, { status: 503 })

  // Trava de custo, antes de gravar qualquer coisa: ler depois decidir não é
  // atômico, então N requisições simultâneas passariam todas. O agente não
  // consome de novo — ver `consumirLimite` abaixo.
  const limite = await consumirLimiteDoConsultor(orgId)
  if (!limite.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Limite de uso do consultor atingido. Tente de novo em ${limite.retryAfterSeconds}s.`,
      },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfterSeconds) } },
    )
  }

  const body = await request.json()
  const { conversationId, insightId, message, history } = body as {
    conversationId?: string
    insightId?: string
    message: string
    history?: ChatMessage[]
  }

  let historico: ChatMessage[] = []
  let convId = conversationId

  if (convId) {
    const conv = await getConversation(convId, orgId)
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const dbMessages = await getConversationMessages(convId, 20)
    historico = historicoParaOAgente(
      dbMessages.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    )
  } else if (insightId) {
    historico = historicoParaOAgente(history ?? [])
    // O cliente já manda a pergunta atual como último item do histórico.
    const ultima = historico[historico.length - 1]
    if (ultima && ultima.role === 'user' && ultima.content === message) historico = historico.slice(0, -1)
  } else {
    const conv = await createConversation(orgId, userId, message.slice(0, 60))
    convId = conv.id
  }

  if (convId && !insightId) await saveMessage(convId, 'user', message)

  let insightContext = undefined
  if (insightId) {
    const [insight] = await withUserDb((tx) =>
      tx
        .select()
        .from(cfoInsights)
        .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))
        .limit(1),
    )
    insightContext = insight
  }

  let system: string
  try {
    system = montarPrompt(await carregarDadosDoPrompt(orgId, userId, 'web', insightContext))
  } catch (err) {
    console.error('[consultor] falha ao montar o prompt:', err)
    return NextResponse.json({ error: 'Failed to build context' }, { status: 500 })
  }

  const provider = createAnthropicProvider({
    apiKey,
    model: process.env.CFO_CHAT_MODEL ?? 'claude-sonnet-5',
    maxTokens: 8000,
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const enviar = (chunk: ChatStreamChunk) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))

      try {
        const r = await responder(
          {
            orgId,
            userId,
            canal: 'web',
            historico,
            mensagem: message,
            system,
            onTexto: (text) => enviar({ type: 'text', text }),
            onSugestao: (toolCall) => enviar({ type: 'tool_call', toolCall }),
          },
          {
            provider,
            ferramentas: FERRAMENTAS,
            // o route já consumiu o limite antes de gravar a conversa
            consumirLimite: async () => ({ allowed: true as const }),
            log: (msg, err) => console.error(msg, err ?? ''),
          },
        )
        if (r.tipo === 'limite') {
          // O route web já consumiu o limite acima; este branch é para canais
          // (ex. WhatsApp) que deixam o agente aplicar o limite.
          enviar({ type: 'error', text: r.texto })
        } else {
          if (convId && !insightId) {
            await saveMessage(convId, 'assistant', r.texto, r.sugestoes.length > 0 ? r.sugestoes : null)
          }
          enviar({ type: 'done' })
        }
      } catch (err) {
        console.error('[consultor] erro no laço:', err)
        enviar({ type: 'error', text: INDISPONIVEL })
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(convId && !insightId ? { 'X-Conversation-Id': convId } : {}),
    },
  })
}
