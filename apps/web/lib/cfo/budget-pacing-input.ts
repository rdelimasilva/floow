/**
 * Monta o input do analyzer de ritmo de gasto para o motor CFO.
 *
 * Vive fora de engine.ts porque aquele arquivo já está perto do limite de 500
 * linhas do projeto. Usa Drizzle direto, sem cache de RSC, pela mesma razão que
 * o resto do engine: roda a partir de rotas de API e do cron diário.
 */
import { getDb, transactions, accounts, categories, budgetEntries } from '@floow/db'
import { and, eq, gte, lte, isNull, or, sql } from 'drizzle-orm'
import {
  computeBudgetPacing,
  buildParentIndex,
  rollUpToBudgetedCategories,
} from '@floow/core-finance'
import type { AccountKind, DailySpendRow } from '@floow/core-finance'
import type { BudgetPacingAnalyzerInput } from '@floow/core-finance'
import { saoPauloToday, monthStartUTC, monthEndUTC, monthKeyUTC } from '@/lib/finance/sp-date'
import { somenteRealizado } from '@/lib/finance/realized-spending'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { buscarParcelasAVencer } from '@/lib/finance/parcelas-a-vencer-queries'
import {
  buscarRecorrentesAVencer,
  condicaoDoPrevisto,
  ehGastoFixo,
  montarAVencer,
  previstoDaRecorrencia,
} from '@/lib/finance/gasto-fixo'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes, somarRecorrentesPorCategoria } from '@/lib/finance/recurring-budget'

export async function buildBudgetPacingInput(
  orgId: string,
): Promise<BudgetPacingAnalyzerInput | undefined> {
  const db = getDb()
  const today = saoPauloToday()
  const monthStart = monthStartUTC(today)
  const monthEnd = monthEndUTC(today)

  // Tetos ativos no mês corrente (mesma regra de getBudgetEntriesForMonth).
  const capRows = await db
    .select({ id: budgetEntries.id, categoryId: budgetEntries.categoryId, plannedCents: budgetEntries.plannedCents })
    .from(budgetEntries)
    .where(
      and(
        eq(budgetEntries.orgId, orgId),
        eq(budgetEntries.type, 'spending'),
        lte(budgetEntries.startMonth, monthStart),
        or(isNull(budgetEntries.endMonth), gte(budgetEntries.endMonth, monthStart)),
      ),
    )

  // Recorrentes marcadas como meta entram como piso, igual à tela de metas.
  const ocorrencias = await buscarOcorrenciasDeRecorrentes(db, orgId, monthStart, monthEnd)
  const budgets = combinarMetasDoMes(capRows, somarRecorrentesPorCategoria(ocorrencias))
    .filter((r): r is typeof r & { categoryId: string } => r.categoryId !== null)
    .map((r) => ({ categoryId: r.categoryId, plannedCents: r.plannedCents }))

  // Sem teto definido não há ritmo a julgar — evita rodar a agregação à toa.
  if (budgets.length === 0) return undefined

  const dailyRows = await db
    .select({
      date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`.as('date'),
      accountType: accounts.type,
      categoryId: transactions.categoryId,
      cents: sql<number>`SUM(-${transactions.amountCents})`.as('cents'),
      fixed: ehGastoFixo.as('fixed'),
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(previstoDaRecorrencia, condicaoDoPrevisto)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        eq(transactions.reviewState, 'confirmed'),
        eq(transactions.isIgnored, false),
        somenteRealizado,
        // Mesmo universo de getDailySpending: aplicação em investimento não é gasto.
        effectiveAffectsCashFlow,
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      ),
    )
    .groupBy(transactions.date, accounts.type, transactions.categoryId, ehGastoFixo)

  const rawDaily: DailySpendRow[] = dailyRows.map((r) => ({
    date: r.date,
    accountType: r.accountType as AccountKind,
    categoryId: r.categoryId,
    cents: Number(r.cents),
    fixed: Boolean(r.fixed),
  }))

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(or(eq(categories.orgId, orgId), isNull(categories.orgId)))

  // A taxonomia da Polp tem dois níveis, e o teto pode estar em qualquer um
  // deles. Sem subir o gasto da filha até a raiz orçada, um teto em
  // "Alimentação" ignoraria o que cai em "Supermercado" e apareceria intocado
  // enquanto o dinheiro sai. computeBudgetPacing casa por id e não sabe de
  // hierarquia — de propósito.
  const parentIndex = buildParentIndex(categoryRows)
  const budgetedIds = new Set(budgets.map((b) => b.categoryId))
  const daily = rollUpToBudgetedCategories(rawDaily, parentIndex, budgetedIds)

  // Parcelas do cartão e recorrências que vencem no mês: mesma conta da tela do Ritmo.
  const [parcelas, recorrentes] = await Promise.all([
    buscarParcelasAVencer(db, orgId, monthStart, monthEnd),
    buscarRecorrentesAVencer(db, orgId, monthStart, monthEnd),
  ])
  const committed = montarAVencer(parcelas, recorrentes, parentIndex, budgetedIds)

  return {
    pacing: computeBudgetPacing({ daily, budgets, committed, monthStart, today }),
    categoryNames: Object.fromEntries(categoryRows.map((c) => [c.id, c.name])),
    month: monthKeyUTC(today),
  }
}
