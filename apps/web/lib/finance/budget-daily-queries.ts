import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb, transactions, accounts } from '@floow/db'
import type { DailySpendRow } from '@floow/core-finance'
import { budgetSpendingTag } from '@/lib/cache-tags'

/**
 * Gasto diário agregado por dia, tipo de conta e categoria, no intervalo dado.
 *
 * Despesas são persistidas com valor negativo (ver actions.ts:301), por isso a
 * soma usa -amount_cents: o resultado sai positivo e um estorno importado como
 * expense positivo abate corretamente.
 *
 * Função irmã de getSpendingByCategory, não substituta — /budgets/spending
 * continua usando aquela.
 */
export const getDailySpending = cache(async function getDailySpending(
  orgId: string,
  start: Date,
  end: Date,
): Promise<DailySpendRow[]> {
  return unstable_cache(
    async () => {
      const db = getDb()

      const rows = await db
        .select({
          date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`.as('date'),
          accountType: accounts.type,
          categoryId: transactions.categoryId,
          cents: sql<number>`SUM(-${transactions.amountCents})`.as('cents'),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.type, 'expense'),
            eq(transactions.reviewState, 'confirmed'),
            eq(transactions.isIgnored, false),
            gte(transactions.date, start),
            lte(transactions.date, end),
          ),
        )
        .groupBy(transactions.date, accounts.type, transactions.categoryId)

      return rows.map((r) => ({
        date: r.date,
        accountType: r.accountType,
        categoryId: r.categoryId,
        cents: Number(r.cents),
      }))
    },
    ['budget-daily-spending', orgId, start.toISOString(), end.toISOString()],
    { tags: [budgetSpendingTag(orgId)], revalidate: 300 },
  )()
})
