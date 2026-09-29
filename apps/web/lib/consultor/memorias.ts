/**
 * Memória do consultor: o que ele aprendeu sobre o usuário, por org.
 *
 * Tudo sob o RLS do usuário (withUserDbFor): o WhatsApp não tem sessão, então
 * o userId entra explícito. O filtro por org_id vai junto porque o mesmo
 * usuário pode estar em várias orgs e a memória de uma não vale na outra.
 */
import { consultorMemorias } from '@floow/db'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { withUserDbFor } from '@/lib/db/rls'

export const MAX_MEMORIAS = 50

export type CanalDaMemoria = 'web' | 'whatsapp'

export interface Memoria {
  id: string
  conteudo: string
  createdAt: Date
}

const doUsuario = (orgId: string, userId: string) =>
  and(eq(consultorMemorias.orgId, orgId), eq(consultorMemorias.userId, userId))

export function listarMemorias(orgId: string, userId: string): Promise<Memoria[]> {
  return withUserDbFor(userId, (tx) =>
    tx
      .select({ id: consultorMemorias.id, conteudo: consultorMemorias.conteudo, createdAt: consultorMemorias.createdAt })
      .from(consultorMemorias)
      .where(doUsuario(orgId, userId))
      .orderBy(asc(consultorMemorias.createdAt)),
  )
}

/** No teto, a mais antiga sai para a nova entrar. */
export function gravarMemoria(p: { orgId: string; userId: string; canal: CanalDaMemoria; conteudo: string }): Promise<void> {
  return withUserDbFor(p.userId, async (tx) => {
    const [{ total }] = await tx
      .select({ total: count() })
      .from(consultorMemorias)
      .where(doUsuario(p.orgId, p.userId))
    if (Number(total) >= MAX_MEMORIAS) {
      const maisAntigas = tx
        .select({ id: consultorMemorias.id })
        .from(consultorMemorias)
        .where(doUsuario(p.orgId, p.userId))
        .orderBy(asc(consultorMemorias.createdAt))
        .limit(Number(total) - MAX_MEMORIAS + 1)
      await tx.delete(consultorMemorias).where(inArray(consultorMemorias.id, maisAntigas))
    }
    await tx.insert(consultorMemorias).values({
      orgId: p.orgId,
      userId: p.userId,
      canal: p.canal,
      conteudo: p.conteudo.replace(/\s+/g, ' ').trim(),
    })
  })
}

export function apagarMemoria(orgId: string, userId: string, id: string): Promise<boolean> {
  return withUserDbFor(userId, async (tx) => {
    const apagadas = await tx
      .delete(consultorMemorias)
      .where(and(doUsuario(orgId, userId), eq(consultorMemorias.id, id)))
      .returning({ id: consultorMemorias.id })
    return apagadas.length > 0
  })
}
