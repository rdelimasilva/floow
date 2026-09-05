import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { getDb, orgs, transactions, counterparties } from '@floow/db'
import { getOrgId } from '@/lib/finance/queries'

/**
 * O portão bloqueia o app inteiro no lugar do dashboard, só até a org zerar a
 * fila pela primeira vez. Ligado à ORG, não à conexão: uma vez destravada,
 * conectar um segundo banco depois só empilha no balde não-bloqueante do
 * regime permanente — não reabre o portão.
 *
 * Leitura pura — não grava nada. Quem grava `reviewGateClearedAt` é
 * `confirmCounterparty`, no momento em que uma confirmação de verdade zera a
 * fila (ver achado da revisão final do branch: gravar aqui, como efeito de
 * uma leitura que roda em todo request, destravava orgs que nunca tiveram
 * fila nenhuma, antes do bootstrap sequer existir).
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
    .where(and(
      eq(transactions.orgId, orgId),
      eq(transactions.reviewState, 'pending'),
      isNotNull(transactions.counterpartyId),
    ))
    .limit(1)

  return { blocked: Boolean(pending) }
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

export interface PendingGroupItem {
  id: string
  date: string
  description: string
  amountCents: number
}

export interface PendingGroup {
  counterpartyId: string
  displayName: string
  keyType: 'tax_id' | 'description'
  count: number
  totalCents: number
  items: PendingGroupItem[]
}

/**
 * Contrapartes pendentes da org, com os lançamentos por trás de cada uma.
 * Ordenada por dinheiro — o mesmo princípio que o detector antigo já validou:
 * "R$ 92 mil" move o usuário, "12 lançamentos" não.
 */
export async function getPendingCounterpartyGroups(orgId: string): Promise<PendingGroup[]> {
  const db = getDb()

  const rows = await db
    .select({
      counterpartyId: transactions.counterpartyId,
      displayName: counterparties.displayName,
      keyType: counterparties.keyType,
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .innerJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
    .where(and(eq(transactions.orgId, orgId), eq(transactions.reviewState, 'pending')))
    .orderBy(transactions.date)

  const groups = new Map<string, PendingGroup>()
  for (const row of rows) {
    if (!row.counterpartyId) continue
    let group = groups.get(row.counterpartyId)
    if (!group) {
      group = { counterpartyId: row.counterpartyId, displayName: row.displayName, keyType: row.keyType, count: 0, totalCents: 0, items: [] }
      groups.set(row.counterpartyId, group)
    }
    group.count++
    group.totalCents += row.amountCents
    group.items.push({
      id: row.id,
      date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
      description: row.description,
      amountCents: row.amountCents,
    })
  }

  return [...groups.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

export interface ConfirmedCounterparty {
  id: string
  displayName: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  confirmedAt: string
}

/** Contrapartes já confirmadas, para a aba editável da fila. */
export async function getConfirmedCounterparties(orgId: string): Promise<ConfirmedCounterparty[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(counterparties)
    .where(and(eq(counterparties.orgId, orgId), sql`${counterparties.confirmedAt} is not null`))
    .orderBy(desc(counterparties.confirmedAt))

  return rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    nature: row.nature!,
    categoryId: row.categoryId,
    confirmedAt: row.confirmedAt!.toISOString(),
  }))
}
