import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { and, eq, gt, gte, isNotNull, lte } from 'drizzle-orm'
import { transactions, categories } from '@floow/db'
import { budgetSpendingTag } from '@/lib/cache-tags'
import { requireIdentity } from '@/lib/auth/session'
import { withUserDbFor } from '@/lib/db/rls'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { somarParcelasPorCategoria, type ParcelasDaCategoria } from './parcelas-a-vencer'

/**
 * Parcelas de cartão do mês que ainda não entraram no gasto: reais de data
 * futura e previsões. `purchase_date` separa parcela de cartão da parcela
 * manual, que não tem data de compra.
 */
export const getParcelasAVencerDoMes = cache(async function getParcelasAVencerDoMes(
  orgId: string,
  start: Date,
  end: Date,
): Promise<Record<string, ParcelasDaCategoria>> {
  const { userId } = await requireIdentity()
  return unstable_cache(
    () =>
      withUserDbFor(userId, async (db) => {
        const rows = await db
          .select({
            categoryId: transactions.categoryId,
            description: transactions.description,
            installmentNumber: transactions.installmentNumber,
            installmentTotal: transactions.installmentTotal,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .leftJoin(categories, eq(categories.id, transactions.categoryId))
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.type, 'expense'),
              eq(transactions.reviewState, 'confirmed'),
              eq(transactions.isIgnored, false),
              eq(transactions.balanceApplied, false),
              isNotNull(transactions.purchaseDate),
              gt(transactions.installmentTotal, 1),
              isNotNull(transactions.categoryId),
              // Mesmo universo do gasto: aplicação em investimento não conta como gasto nem como a vencer.
              effectiveAffectsCashFlow,
              gte(transactions.date, start),
              lte(transactions.date, end),
            ),
          )
        return somarParcelasPorCategoria(
          rows.map((r) => ({
            categoryId: r.categoryId as string,
            description: r.description,
            installmentNumber: r.installmentNumber ?? 0,
            installmentTotal: r.installmentTotal ?? 0,
            amountCents: Math.abs(r.amountCents),
          })),
        )
      }),
    ['budget-parcelas-a-vencer', orgId, userId, start.toISOString(), end.toISOString()],
    { tags: [budgetSpendingTag(orgId)], revalidate: 300 },
  )()
})
