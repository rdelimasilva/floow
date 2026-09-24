import { cache } from 'react'
import { debts, transactions } from '@floow/db'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { withUserDb } from '@/lib/db/rls'

// Os filtros por orgId continuam explícitos de propósito. O RLS já isola, mas
// um usuário pode pertencer a mais de uma org — o filtro é o que escolhe QUAL
// org está sendo consultada, e o RLS é quem garante que ela é dele.

/** Returns all active debts for the org. */
export const getDebts = cache(async function getDebts(orgId: string) {
  return withUserDb((tx) =>
    tx
      .select()
      .from(debts)
      .where(and(eq(debts.orgId, orgId), eq(debts.isActive, true)))
      .orderBy(debts.startDate),
  )
})

/** Returns payment progress for a debt by counting/summing transactions with matching category. */
export async function getDebtProgress(orgId: string, categoryId: string) {
  const [row] = await withUserDb((tx) =>
    tx.select({
      paidCount: sql<number>`COUNT(*)`.as('paid_count'),
      // Despesas são persistidas negativas (actions.ts). -x em vez de ABS(x) dá o
      // mesmo resultado para elas e abate corretamente um estorno importado como
      // expense positivo, em vez de contá-lo como pagamento.
      paidCents: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`.as('paid_cents'),
    })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.categoryId, categoryId),
          eq(transactions.type, 'expense'),
          eq(transactions.reviewState, 'confirmed'),
          eq(transactions.isIgnored, false),
        ),
      ),
  )
  return { paidCount: Number(row.paidCount), paidCents: Number(row.paidCents) }
}

/**
 * Dívidas ativas com o progresso de pagamento, numa transação só.
 *
 * Eram duas `withUserDb` em sequência — cada uma abre e fecha transação no
 * pooler — e a soma agrupava toda categoria de despesa da org para usar só as
 * das dívidas. Agora o progresso filtra pelas categorias das dívidas.
 */
export async function getDebtsWithProgress(orgId: string) {
  const { allDebts, progressRows } = await withUserDb(async (tx) => {
    const allDebts = await tx
      .select()
      .from(debts)
      .where(and(eq(debts.orgId, orgId), eq(debts.isActive, true)))
      .orderBy(debts.startDate)
    if (allDebts.length === 0) return { allDebts, progressRows: [] }

    const categoriasDasDividas = [...new Set(allDebts.map((d) => d.categoryId))]
    const progressRows = await tx
      .select({
        categoryId: transactions.categoryId,
        paidCount: sql<number>`COUNT(*)`.as('paid_count'),
        // Despesas são persistidas negativas (actions.ts). -x em vez de ABS(x) dá o
        // mesmo resultado para elas e abate corretamente um estorno importado como
        // expense positivo, em vez de contá-lo como pagamento.
        paidCents: sql<number>`COALESCE(SUM(-${transactions.amountCents}), 0)`.as('paid_cents'),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(transactions.categoryId, categoriasDasDividas),
          eq(transactions.type, 'expense'),
          eq(transactions.reviewState, 'confirmed'),
          eq(transactions.isIgnored, false),
        ),
      )
      .groupBy(transactions.categoryId)
    return { allDebts, progressRows }
  })
  if (allDebts.length === 0) return []

  const progressByCategory = new Map(
    progressRows.map((row) => [
      row.categoryId,
      { paidCount: Number(row.paidCount), paidCents: Number(row.paidCents) },
    ])
  )

  return allDebts.map((debt) => {
    const progress = progressByCategory.get(debt.categoryId) ?? { paidCount: 0, paidCents: 0 }
    const remainingCents = debt.totalCents - progress.paidCents
    const paidMonths = progress.paidCount
    const nextDue = new Date(debt.startDate)
    nextDue.setMonth(nextDue.getMonth() + paidMonths)

    return {
      ...debt,
      paidCount: progress.paidCount,
      paidCents: progress.paidCents,
      remainingCents: Math.max(0, remainingCents),
      progressPct: debt.totalCents > 0 ? Math.round((progress.paidCents / debt.totalCents) * 100) : 0,
      nextDueDate: nextDue,
    }
  })
}
