import { getDb, cfoConversations, cfoMessages } from '@floow/db'
import { eq } from 'drizzle-orm'

export async function createConversation(orgId: string, userId: string, title?: string) {
  const db = getDb()
  const [conv] = await db
    .insert(cfoConversations)
    .values({ orgId, userId, title: title ?? 'Nova conversa' })
    .returning()
  return conv
}

export async function saveMessage(
  conversationId: string,
  role: string,
  content: string,
  toolCall?: unknown,
  toolResult?: unknown,
) {
  const db = getDb()
  await db.insert(cfoMessages).values({
    conversationId,
    role,
    content,
    toolCall: toolCall ?? null,
    toolResult: toolResult ?? null,
  })

  await db
    .update(cfoConversations)
    .set({ updatedAt: new Date() })
    .where(eq(cfoConversations.id, conversationId))
}
