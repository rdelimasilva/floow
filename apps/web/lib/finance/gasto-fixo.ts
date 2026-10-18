import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { transactions, recurringTemplates, categories, type RlsTx } from '@floow/db'
import { resolveBudgetedCategory } from '@floow/core-finance'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { budgetSpendingTag } from '@/lib/cache-tags'
import { requireIdentity } from '@/lib/auth/session'
import { withUserDbFor } from '@/lib/db/rls'
import type { ParcelasDaCategoria } from './parcelas-a-vencer'

/** Só leitura: a tela passa a transação sob RLS; o motor do CFO, a conexão de serviço. */
type Leitor = Pick<RlsTx, 'select'>

/**
 * Gasto realizado que é conta fixa: gerado por uma recorrência, ou o
 * lançamento do banco que uma previsão de recorrência reivindicou
 * (`matched_transaction_id` aponta do previsto para o realizado). O Ritmo
 * conta esse gasto uma vez, sem esticá-lo pelos dias do mês.
 *
 * Uso: `.leftJoin(previstoDaRecorrencia, condicaoDoPrevisto)` e, no select e
 * no groupBy, `ehGastoFixo`. JOIN em vez de EXISTS porque subconsulta
 * correlacionada não pode ir no GROUP BY; o índice único parcial de
 * matched_transaction_id garante no máximo um previsto por realizado, então
 * o JOIN não duplica linhas.
 */
export const previstoDaRecorrencia = alias(transactions, 'previsto_da_recorrencia')

export const condicaoDoPrevisto = and(
  eq(previstoDaRecorrencia.matchedTransactionId, transactions.id),
  isNotNull(previstoDaRecorrencia.recurringTemplateId),
)

export const ehGastoFixo = sql<boolean>`(${transactions.recurringTemplateId} IS NOT NULL OR ${previstoDaRecorrencia.id} IS NOT NULL)`

/**
 * Recorrências de despesa do mês que ainda não aconteceram: previsão sem
 * vínculo com o realizado. A previsão já cumprida tem `matched_transaction_id`
 * e o realizado dela já está no gasto.
 */
export async function buscarRecorrentesAVencer(
  db: Leitor,
  orgId: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      cents: sql<number>`SUM(-${transactions.amountCents})`.as('cents'),
    })
    .from(transactions)
    .innerJoin(recurringTemplates, eq(transactions.recurringTemplateId, recurringTemplates.id))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        eq(transactions.reviewState, 'confirmed'),
        eq(transactions.isIgnored, false),
        eq(transactions.balanceApplied, false),
        isNull(transactions.matchedTransactionId),
        // Parcela de cartão já vem por buscarParcelasAVencer.
        isNull(transactions.purchaseDate),
        isNotNull(transactions.categoryId),
        // Pausar não apaga as previsões já geradas.
        eq(recurringTemplates.isActive, true),
        effectiveAffectsCashFlow,
        gte(transactions.date, start),
        lte(transactions.date, end),
      ),
    )
    .groupBy(transactions.categoryId)

  return Object.fromEntries(rows.map((r) => [r.categoryId as string, Number(r.cents)]))
}

/** Versão da tela: cacheada, sob o RLS do usuário. */
export const getRecorrentesAVencerDoMes = cache(async function getRecorrentesAVencerDoMes(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const { userId } = await requireIdentity()
  return unstable_cache(
    () => withUserDbFor(userId, (db) => buscarRecorrentesAVencer(db, orgId, start, end)),
    ['budget-recorrentes-a-vencer', orgId, userId, start.toISOString(), end.toISOString()],
    { tags: [budgetSpendingTag(orgId)], revalidate: 300 },
  )()
})

/**
 * O que vence ainda no mês (parcelas do cartão + recorrências), já na
 * categoria que tem o teto. Mesma conta na tela do Ritmo e no CFO.
 */
export function montarAVencer(
  parcelas: Record<string, ParcelasDaCategoria>,
  recorrentes: Record<string, number>,
  parentIndex: Map<string, string | null>,
  budgetedIds: Set<string>,
): { categoryId: string; cents: number }[] {
  const brutos = [
    ...Object.entries(parcelas).map(([categoryId, p]) => ({ categoryId, cents: p.totalCents })),
    ...Object.entries(recorrentes).map(([categoryId, cents]) => ({ categoryId, cents })),
  ]
  return brutos.flatMap(({ categoryId, cents }) => {
    const target = resolveBudgetedCategory(categoryId, parentIndex, budgetedIds)
    return target ? [{ categoryId: target, cents }] : []
  })
}
