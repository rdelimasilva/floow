/**
 * Dados da sugestão de metas: gasto mensal por categoria nos meses fechados.
 * Mesmo universo de gasto de `getSpendingByCategory` (despesa confirmada, não
 * ignorada, realizada, que conta no fluxo de caixa), para a meta sugerida
 * bater com o "Realizado" que a tela mostra depois.
 */
import { and, eq, gte, lt, min, sql } from 'drizzle-orm'
import { categories, transactions } from '@floow/db'
import {
  goalWindowMonths,
  suggestBudgetGoals,
  type BudgetGoalSuggestion,
  type GoalCategory,
} from '@floow/core-finance'
import { withUserDb } from '@/lib/db/rls'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { somenteRealizado } from '@/lib/finance/realized-spending'

export interface BudgetGoalSuggestionRow extends BudgetGoalSuggestion {
  categoryName: string
}

export async function getBudgetGoalSuggestions(
  orgId: string,
  expenseCategories: GoalCategory[],
  categoriesWithGoal: Set<string>,
): Promise<BudgetGoalSuggestionRow[]> {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const inicioMesAtual = `${hoje.slice(0, 7)}-01`

  const gasto = and(
    eq(transactions.orgId, orgId),
    eq(transactions.type, 'expense'),
    eq(transactions.reviewState, 'confirmed'),
    eq(transactions.isIgnored, false),
    somenteRealizado,
    effectiveAffectsCashFlow,
  )

  const { rows, months } = await withUserDb(async (tx) => {
    const [{ primeiro }] = await tx
      .select({ primeiro: sql<string | null>`to_char(${min(transactions.date)}, 'YYYY-MM')` })
      .from(transactions)
      // effectiveAffectsCashFlow lê categories.affects_cash_flow.
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(gasto)
    const meses = goalWindowMonths(hoje, primeiro)
    if (meses.length === 0) return { rows: [], months: meses }

    const mes = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
    const linhas = await tx
      .select({
        categoryId: transactions.categoryId,
        month: mes,
        cents: sql<number>`SUM(-${transactions.amountCents})`,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          gasto,
          gte(transactions.date, sql`${`${meses[0]}-01`}::date`),
          lt(transactions.date, sql`${inicioMesAtual}::date`),
        ),
      )
      .groupBy(transactions.categoryId, mes)
    return { rows: linhas, months: meses }
  })

  const nomes = new Map(expenseCategories.map((c) => [c.id, c.name]))
  return suggestBudgetGoals({
    rows: rows.map((r) => ({ categoryId: r.categoryId, month: r.month, cents: Number(r.cents) })),
    categories: expenseCategories,
    categoriesWithGoal,
    months,
  }).map((s) => ({ ...s, categoryName: nomes.get(s.categoryId) ?? '' }))
}
