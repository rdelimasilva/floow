import { cfoConversations, cfoMessages } from '@floow/db'
import { eq, and, desc } from 'drizzle-orm'
import { withUserDb } from '@/lib/db/rls'

export async function getConversation(conversationId: string, orgId: string) {
  return withUserDb(async (db) => {
    const [conv] = await db
      .select()
      .from(cfoConversations)
      .where(and(eq(cfoConversations.id, conversationId), eq(cfoConversations.orgId, orgId)))
      .limit(1)
    return conv ?? null
  })
}

export async function getConversationMessages(conversationId: string, limit = 20) {
  return withUserDb(async (db) => {
    const messages = await db
      .select()
      .from(cfoMessages)
      .where(eq(cfoMessages.conversationId, conversationId))
      .orderBy(desc(cfoMessages.createdAt))
      .limit(limit)
    return messages.reverse()
  })
}

export async function getRecentConversations(orgId: string, userId: string, limit = 10) {
  return withUserDb(async (db) => {
    return db
      .select()
      .from(cfoConversations)
      .where(and(eq(cfoConversations.orgId, orgId), eq(cfoConversations.userId, userId)))
      .orderBy(desc(cfoConversations.updatedAt))
      .limit(limit)
  })
}
