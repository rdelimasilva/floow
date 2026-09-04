import { and, eq, sql } from 'drizzle-orm'
import { getDb, orgs, transactions } from '@floow/db'

/**
 * O portão bloqueia o app inteiro no lugar do dashboard, só até a org zerar a
 * fila pela primeira vez. Ligado à ORG, não à conexão: uma vez destravada,
 * conectar um segundo banco depois só empilha no balde não-bloqueante do
 * regime permanente — não reabre o portão.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */
export async function getReviewGateStatus(orgId: string): Promise<{ blocked: boolean }> {
  const db = getDb()

  const [org] = await db
    .select({ reviewGateClearedAt: orgs.reviewGateClearedAt })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1)

  if (org?.reviewGateClearedAt) return { blocked: false }

  const [pending] = await db
    .select({ one: sql`1` })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewState, 'pending')))
    .limit(1)

  if (!pending) {
    // Nunca teve pendência (org sem Open Finance, ou acabou de zerar a fila
    // agora mesmo) — destrava e grava, para sempre.
    await db.update(orgs).set({ reviewGateClearedAt: new Date() }).where(eq(orgs.id, orgId))
    return { blocked: false }
  }

  return { blocked: true }
}
