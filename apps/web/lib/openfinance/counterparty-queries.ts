import { and, eq, sql } from 'drizzle-orm'
import { getDb, orgs, transactions } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'

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

type ReviewGateSafeResult = { ok: true; orgId: string; blocked: boolean } | { ok: false }

/**
 * Versão "fail open" de `getReviewGateStatus`, para uso no layout raiz de
 * `(app)`. O layout não tem error boundary próprio — um erro lançado ali
 * (ex.: "No organization found for user") não é pego pelo `(app)/error.tsx`
 * do segmento (o Next.js não deixa um layout ser coberto pelo error boundary
 * do próprio nível dele) e vaza direto para o `global-error.tsx`, uma tela
 * genérica sem "tentar de novo" que substitui o `<html>` inteiro.
 *
 * Por isso qualquer falha aqui — em `getOrgId()` ou em `getReviewGateStatus`
 * — é tratada como "não bloqueado": nunca mais fechado do que o
 * comportamento anterior a esta task, quando `getOrgId()` só era chamado
 * dentro de páginas filhas (cobertas pelo boundary do segmento). Se uma
 * página filha chamar `getOrgId()` de novo e falhar, o boundary de
 * `(app)/error.tsx` continua pegando normalmente — esta função não muda
 * nada desse caminho.
 */
export async function getReviewGateStatusSafe(): Promise<ReviewGateSafeResult> {
  try {
    const orgId = await getOrgId()
    const { blocked } = await getReviewGateStatus(orgId)
    return { ok: true, orgId, blocked }
  } catch (error) {
    console.error('[review-gate] falha ao checar o portao, seguindo sem bloquear:', error)
    return { ok: false }
  }
}
