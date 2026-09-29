/**
 * Conversa do consultor no WhatsApp: uma por usuário/org (canal 'whatsapp').
 *
 * Sem cookies: tudo sob withUserDbFor(userId), com o userId do número
 * verificado. A pergunta é gravada com o wamid; o índice único de
 * external_id faz a repetição da Meta cair no ON CONFLICT DO NOTHING.
 */
import { cfoConversations, cfoMessages, profiles, type RlsTx } from '@floow/db'
import type { ChatMessage } from '@floow/core-finance'
import { and, desc, eq } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'
import { listUserOrgIds } from '@/lib/notifications/preferences-store'
import { historicoParaOAgente } from '@/lib/consultor/historico'

const LIMITE_HISTORICO = 20

export function orgsDoWhatsApp(userId: string): Promise<{ orgIds: string[]; preferida: string | null }> {
  return withUserDbFor(userId, async (tx) => {
    const [perfil] = await tx
      .select({ preferida: profiles.whatsappOrgId })
      .from(profiles)
      .where(eq(profiles.id, userId))
    return { orgIds: await listUserOrgIds(tx, userId), preferida: perfil?.preferida ?? null }
  })
}

async function conversaDoWhatsApp(tx: RlsTx, userId: string, orgId: string): Promise<string> {
  const [existente] = await tx
    .select({ id: cfoConversations.id })
    .from(cfoConversations)
    .where(and(eq(cfoConversations.orgId, orgId), eq(cfoConversations.userId, userId), eq(cfoConversations.canal, 'whatsapp')))
    .orderBy(desc(cfoConversations.updatedAt))
    .limit(1)
  if (existente) return existente.id
  const [nova] = await tx
    .insert(cfoConversations)
    .values({ orgId, userId, canal: 'whatsapp', title: 'WhatsApp' })
    .returning({ id: cfoConversations.id })
  return nova.id
}

export function registrarPergunta(p: {
  userId: string
  orgId: string
  texto: string
  wamid?: string
}): Promise<{ conversaId: string; historico: ChatMessage[] } | null> {
  return withUserDbFor(p.userId, async (tx) => {
    const conversaId = await conversaDoWhatsApp(tx, p.userId, p.orgId)
    const anteriores = await tx
      .select()
      .from(cfoMessages)
      .where(eq(cfoMessages.conversationId, conversaId))
      .orderBy(desc(cfoMessages.createdAt))
      .limit(LIMITE_HISTORICO)
    const gravada = await tx
      .insert(cfoMessages)
      .values({ conversationId: conversaId, role: 'user', content: p.texto, externalId: p.wamid ?? null })
      .onConflictDoNothing()
      .returning({ id: cfoMessages.id })
    if (gravada.length === 0) return null
    const historico = historicoParaOAgente(
      anteriores.reverse().map((m) => ({
        id: m.id,
        role: m.role as ChatMessage['role'],
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    )
    return { conversaId, historico }
  })
}

export function registrarResposta(p: { userId: string; conversaId: string; texto: string }): Promise<void> {
  return withUserDbFor(p.userId, async (tx) => {
    await tx.insert(cfoMessages).values({ conversationId: p.conversaId, role: 'assistant', content: p.texto })
    await tx.update(cfoConversations).set({ updatedAt: new Date() }).where(eq(cfoConversations.id, p.conversaId))
  })
}
