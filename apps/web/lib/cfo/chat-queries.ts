import { getDb, cfoConversations, cfoMessages } from '@floow/db'
import { eq, and, desc } from 'drizzle-orm'

export async function getConversation(conversationId: string, orgId: string) {
  const db = getDb()
  const [conv] = await db
    .select()
    .from(cfoConversations)
    .where(and(eq(cfoConversations.id, conversationId), eq(cfoConversations.orgId, orgId)))
    .limit(1)
  return conv ?? null
}

export async function getConversationMessages(conversationId: string, limit = 20) {
  const db = getDb()
  const messages = await db
    .select()
    .from(cfoMessages)
    .where(eq(cfoMessages.conversationId, conversationId))
    .orderBy(desc(cfoMessages.createdAt))
    .limit(limit)
  return messages.reverse()
}

export async function getRecentConversations(orgId: string, userId: string, limit = 10) {
  const db = getDb()
  return db
    .select()
    .from(cfoConversations)
    .where(and(eq(cfoConversations.orgId, orgId), eq(cfoConversations.userId, userId)))
    .orderBy(desc(cfoConversations.updatedAt))
    .limit(limit)
}
