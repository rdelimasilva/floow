import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAnthropicProvider } from '@floow/core-finance'
import type { ChatMessage } from '@floow/core-finance'
import { buildChatSystemPrompt } from '@/lib/cfo/chat-context'
import { CHAT_TOOLS } from '@/lib/cfo/chat-tools'
import { getConversationMessages, getConversation } from '@/lib/cfo/chat-queries'
import { createConversation, saveMessage } from '@/lib/cfo/chat-actions'
import { getDb, cfoInsights, cfoMessages, cfoConversations } from '@floow/db'
import { eq, and, gte, sql } from 'drizzle-orm'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = session.user.app_metadata?.org_ids?.[0]
  const userId = session.user.id
  if (!orgId) {
    return NextResponse.json({ error: 'No org' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Chat not configured' }, { status: 503 })
  }

  // Rate limiting: max 30 messages/hour per org
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const db = getDb()
  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(cfoMessages)
    .innerJoin(cfoConversations, eq(cfoMessages.conversationId, cfoConversations.id))
    .where(and(
      eq(cfoConversations.orgId, orgId),
      gte(cfoMessages.createdAt, oneHourAgo),
    ))
  if (Number(countRow?.count ?? 0) >= 30) {
    return NextResponse.json({ error: 'rate_limited', message: 'Limite de 30 mensagens/hora atingido.' }, { status: 429 })
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

  const systemPrompt = await buildChatSystemPrompt(orgId, insightContext)
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', text: 'Erro ao processar' })}\n\n`))
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
