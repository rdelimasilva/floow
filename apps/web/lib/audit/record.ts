import { getDb, auditLog } from '@floow/db'
import { getVerifiedIdentity } from '@/lib/auth/session'

export interface AuditEntry {
  /** Verbo no formato `recurso.ação`, ex.: 'transactions.export'. */
  action: string
  /** Tabela ou coleção tocada, ex.: 'transactions'. */
  resource?: string
  /** Volume lido ou afetado, quando faz sentido contar. */
  resourceCount?: number
  /** Contexto extra. Não colocar dado sensível aqui — a trilha é legível pela org. */
  metadata?: Record<string, unknown>
}

/**
 * Registra uma ação sensível na trilha de auditoria.
 *
 * O ator e a org NUNCA vêm do chamador: saem sempre da identidade verificada da
 * requisição. Aceitar esses campos por parâmetro seria reabrir, no log, a mesma
 * falha que o log existe para detectar.
 *
 * Nunca lança. Uma falha de auditoria vira warning e a requisição segue — o
 * contrário transformaria a trilha num ponto único de queda do app.
 *
 * Devolve true se gravou.
 */
export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const identity = await getVerifiedIdentity()
    if (!identity) return false

    await getDb()
      .insert(auditLog)
      .values({
        orgId: identity.orgIds[0] ?? null,
        actorUserId: identity.userId,
        action: entry.action,
        resource: entry.resource ?? null,
        resourceCount: entry.resourceCount ?? null,
        metadata: entry.metadata ?? {},
      })

    return true
  } catch (err) {
    console.warn('[audit] falha ao gravar trilha:', err)
    return false
  }
}
