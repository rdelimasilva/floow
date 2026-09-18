import { NextResponse } from 'next/server'
import { getVerifiedIdentity, getOrgId } from '@/lib/auth/session'
import { createAnthropicProvider } from '@floow/core-finance'
import type { ChatMessage } from '@floow/core-finance'
import { buildChatSystemPrompt } from '@/lib/cfo/chat-context'
import { CHAT_TOOLS } from '@/lib/cfo/chat-tools'
import { getConversationMessages, getConversation } from '@/lib/cfo/chat-queries'
import { createConversation, saveMessage } from '@/lib/cfo/chat-actions'
import { getDb, cfoInsights } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { consumeRateLimit } from '@/lib/rate-limit/consume'

/** Rajada: segura o laço. Teto horário: segura o uso sustentado. */
const CHAT_BURST_LIMIT = Number(process.env.CFO_CHAT_BURST_LIMIT ?? 8)
const CHAT_HOURLY_LIMIT = Number(process.env.CFO_CHAT_HOURLY_LIMIT ?? 30)

export async function POST(request: Request) {
  const identity = await getVerifiedIdentity()

  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = identity.userId

  let orgId: string
  try {
    orgId = await getOrgId()
  } catch {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Chat not configured' }, { status: 503 })
  }

  // Trava de custo. A versão anterior contava cfo_messages e decidia — ler
  // depois decidir não é atômico, então N requisições simultâneas liam a mesma
  // contagem e passavam todas. O contador agora é um UPSERT atômico, e a janela
  // curta cobre a rajada que o teto horário sozinho deixava passar.
  const db = getDb()
  for (const janela of [
    { bucket: 'cfo.chat.burst', limit: CHAT_BURST_LIMIT, windowSeconds: 60 },
    { bucket: 'cfo.chat.hour', limit: CHAT_HOURLY_LIMIT, windowSeconds: 3600 },
  ]) {
    const limite = await consumeRateLimit(db, { ...janela, subject: orgId })
    if (!limite.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: `Limite de uso do consultor atingido. Tente de novo em ${limite.retryAfterSeconds}s.`,
        },
        { status: 429, headers: { 'Retry-After': String(limite.retryAfterSeconds) } },
      )
    }
  }

  const body = await request.json()
  const { conversationId, insightId, message, history } = body as {
    conversationId?: string
    insightId?: string
    message: string
    history?: ChatMessage[]
  }

  // Build message history
  let messages: ChatMessage[] = []
  let convId = conversationId

  if (convId) {
    const conv = await getConversation(convId, orgId)
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const dbMessages = await getConversationMessages(convId, 20)
    messages = dbMessages.map((m) => ({
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      toolCall: m.toolCall as ChatMessage['toolCall'],
      toolResult: m.toolResult as ChatMessage['toolResult'],
      createdAt: m.createdAt.toISOString(),
    }))
  } else if (insightId) {
    messages = history ?? []
  } else {
    const conv = await createConversation(orgId, userId, message.slice(0, 60))
    convId = conv.id
  }

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
  }
  messages.push(userMsg)

  if (convId && !insightId) {
    await saveMessage(convId, 'user', message)
  }

  let insightContext = undefined
  if (insightId) {
    const [insight] = await db
      .select()
      .from(cfoInsights)
      .where(and(eq(cfoInsights.id, insightId), eq(cfoInsights.orgId, orgId)))
      .limit(1)
    insightContext = insight
  }

  let systemPrompt: string
  try {
    systemPrompt = await buildChatSystemPrompt(orgId, insightContext)
  } catch (err) {
    console.error('[CFO Chat] Context build error:', err)
    return NextResponse.json({ error: 'Failed to build context', detail: String(err) }, { status: 500 })
  }

  const provider = createAnthropicProvider({ apiKey })

  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        const response = await provider.streamChat(messages, {
          system: systemPrompt,
          tools: CHAT_TOOLS,
          onChunk(chunk) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            if (chunk.type === 'text' && chunk.text) {
              fullContent += chunk.text
            }
          },
        })

        if (convId && !insightId) {
          await saveMessage(
            convId,
            'assistant',
            fullContent,
            response.toolCalls.length > 0 ? response.toolCalls : null,
          )
        }

        controller.close()
      } catch (err) {
        console.error('[CFO Chat] Stream error:', err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', text: String(err) })}\n\n`))
        controller.close()
      }
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
