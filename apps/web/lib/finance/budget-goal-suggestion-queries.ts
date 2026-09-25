/**
 * Dados da sugestão de metas: gasto mensal por categoria nos meses fechados.
 * Mesmo universo de gasto de `getSpendingByCategory` (despesa confirmada, não
 * ignorada, realizada, que conta no fluxo de caixa), para a meta sugerida
 * bater com o "Realizado" que a tela mostra depois.
 */
import { and, eq, gte, lt, min, sql } from 'drizzle-orm'
import { budgetGoalSuggestionDismissals, categories, transactions } from '@floow/db'
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
  /** Primeiro e último mês considerados (YYYY-MM), para explicar o cálculo. */
  firstMonth: string
  lastMonth: string
}

/** O que sai do banco. Não depende das categorias nem das metas da tela. */
export interface DadosDaSugestao {
  rows: { categoryId: string | null; month: string; cents: number }[]
  months: string[]
  descartadas: Set<string>
}

/**
 * A parte de banco, separada da montagem para a página disparar junto com as
 * outras consultas — antes ela esperava o `Promise.all` da página terminar,
 * só porque recebia categorias e metas que o banco nem usa.
 */
export async function carregarDadosDaSugestao(orgId: string): Promise<DadosDaSugestao> {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const inicioMesAtual = `${hoje.slice(0, 7)}-01`
  // O mês mais antigo que a janela pode ter. Gasto antes dele só importa por
  // existir: a janela então começa aqui.
  const inicioDaJanela = `${goalWindowMonths(hoje, '0000-00')[0]}-01`

  const gasto = and(
    eq(transactions.orgId, orgId),
    eq(transactions.type, 'expense'),
    eq(transactions.reviewState, 'confirmed'),
    eq(transactions.isIgnored, false),
    somenteRealizado,
    effectiveAffectsCashFlow,
  )

  return withUserDb(async (tx) => {
    const descartes = await tx
      .select({ categoryId: budgetGoalSuggestionDismissals.categoryId })
      .from(budgetGoalSuggestionDismissals)
      .where(eq(budgetGoalSuggestionDismissals.orgId, orgId))
    const descartadas = new Set(descartes.map((d) => d.categoryId))

    // O primeiro mês com gasto, sem varrer o histórico inteiro: o `min` fica
    // dentro da janela, e o que veio antes dela só precisa de um `exists`, que
    // para na primeira linha. Era um `min` sobre todos os anos da org.
    const [{ primeiro, antes }] = await tx
      .select({
        primeiro: sql<string | null>`to_char(${min(transactions.date)}, 'YYYY-MM')`,
        antes: sql<boolean>`exists (
          select 1 from ${transactions}
            left join ${categories} on ${categories.id} = ${transactions.categoryId}
           where ${gasto} and ${transactions.date} < ${inicioDaJanela}::date)`,
      })
      .from(transactions)
      // effectiveAffectsCashFlow lê categories.affects_cash_flow.
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(gasto, gte(transactions.date, sql`${inicioDaJanela}::date`)))
    const meses = goalWindowMonths(hoje, antes ? inicioDaJanela.slice(0, 7) : primeiro)
    if (meses.length === 0) return { rows: [], months: meses, descartadas }

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
    return {
      rows: linhas.map((r) => ({ categoryId: r.categoryId, month: r.month, cents: Number(r.cents) })),
      months: meses,
      descartadas,
    }
  })
}

export function montarSugestoesDeMeta(
  { rows, months, descartadas }: DadosDaSugestao,
  expenseCategories: GoalCategory[],
  categoriesWithGoal: Set<string>,
): BudgetGoalSuggestionRow[] {
  const nomes = new Map(expenseCategories.map((c) => [c.id, c.name]))
  return suggestBudgetGoals({
    rows,
    categories: expenseCategories,
    categoriesWithGoal,
    months,
    dismissedCategories: descartadas,
  }).map((s) => ({
    ...s,
    categoryName: nomes.get(s.categoryId) ?? '',
    firstMonth: months[0],
    lastMonth: months[months.length - 1],
  }))
}
