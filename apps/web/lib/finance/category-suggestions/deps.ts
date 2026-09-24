/**
 * Implementação real (Drizzle) das deps do job de sugestões. Separada do job
 * para ele ser testável sem banco.
 *
 * Roda tanto pela rota semanal (sem sessão de usuário) quanto pelo botão da
 * tela de metas — por isso usa `getDb()` direto e `buscarOcorrenciasDeRecorrentes`
 * em vez de `getSpendingPlanForMonth`/RSC cache: aquele caminho chama
 * `requireIdentity()` e lança fora de uma requisição autenticada. Mesma razão
 * de `budget-pacing-input.ts`, que monta a meta do mês do mesmo jeito para o
 * motor do CFO.
 */
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { getDb, categorySuggestions, transactions, categories, budgetEntries } from '@floow/db'
import type { CategorySuggestion } from '@floow/core-finance'
import { effectiveAffectsCashFlow } from '@/lib/finance/affects-cash-flow'
import { somenteRealizado } from '@/lib/finance/realized-spending'
import { getCategories } from '@/lib/finance/queries-categories'
import { buscarOcorrenciasDeRecorrentes } from '@/lib/finance/recurring-budget-queries'
import { combinarMetasDoMes, somarRecorrentesPorCategoria } from '@/lib/finance/recurring-budget'
import { saoPauloToday, monthStartUTC, monthEndUTC } from '@/lib/finance/sp-date'
import type { CategorySuggestionDeps, ExistingSuggestion } from './job'
import { hojeSP, inicioDaJanela } from './janela'

function valores(orgId: string, s: CategorySuggestion) {
  return {
    orgId,
    kind: s.kind,
    fingerprint: s.fingerprint,
    suggestedName: s.suggestedName,
    parentCategoryId: s.parentCategoryId,
    sourceCategoryIds: s.sourceCategoryIds,
    merchantKey: s.merchantKey,
    matchValue: s.matchValue,
    txCount: s.txCount,
    totalCents: s.totalCents,
    monthlyAvgCents: s.monthlyAvgCents,
  }
}

export function defaultCategorySuggestionDeps(): CategorySuggestionDeps {
  const db = getDb()
  return {
    async loadInput(orgId) {
      const hoje = hojeSP()
      const inicio = inicioDaJanela(hoje)
      const today = saoPauloToday()
      const monthStart = monthStartUTC(today)
      const monthEnd = monthEndUTC(today)

      const [txs, cats, capRows, ocorrencias] = await Promise.all([
        db
          .select({
            id: transactions.id,
            description: transactions.description,
            amountCents: transactions.amountCents,
            // Coluna é `date` (mode 'date'); to_char evita formatar um Date em JS,
            // que arrastaria fuso — mesmo truque de budget-pacing-input.ts.
            date: sql<string>`to_char(${transactions.date}, 'YYYY-MM-DD')`.as('date'),
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          // effectiveAffectsCashFlow lê categories.affects_cash_flow: sem o join
          // a coluna fica fora do escopo da query e o Postgres recusa.
          .leftJoin(categories, eq(categories.id, transactions.categoryId))
          .where(
            and(
              eq(transactions.orgId, orgId),
              eq(transactions.type, 'expense'),
              eq(transactions.reviewState, 'confirmed'),
              eq(transactions.isIgnored, false),
              somenteRealizado,
              effectiveAffectsCashFlow,
              gte(transactions.date, sql`${inicio}::date`),
              lte(transactions.date, sql`${hoje}::date`),
            ),
          ),
        getCategories(orgId),
        db
          .select({ id: budgetEntries.id, categoryId: budgetEntries.categoryId, plannedCents: budgetEntries.plannedCents })
          .from(budgetEntries)
          .where(
            and(
              eq(budgetEntries.orgId, orgId),
              eq(budgetEntries.type, 'spending'),
              lte(budgetEntries.startMonth, monthStart),
              or(isNull(budgetEntries.endMonth), gte(budgetEntries.endMonth, monthStart)),
            ),
          ),
        buscarOcorrenciasDeRecorrentes(db, orgId, monthStart, monthEnd),
      ])

      const plano = combinarMetasDoMes(capRows, somarRecorrentesPorCategoria(ocorrencias))

      return {
        transactions: txs,
        categories: cats
          .filter((c) => c.type === 'expense')
          .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, polpRef: c.polpRef })),
        // O aceite recusa nome repetido em qualquer tipo: o motor precisa saber de todos.
        existingNames: cats.map((c) => c.name),
        categoriesWithGoal: new Set(plano.map((l) => l.categoryId).filter((id): id is string => !!id)),
      }
    },

    async loadExisting(orgId) {
      return db
        .select({ id: categorySuggestions.id, fingerprint: categorySuggestions.fingerprint, status: categorySuggestions.status })
        .from(categorySuggestions)
        .where(eq(categorySuggestions.orgId, orgId)) as Promise<ExistingSuggestion[]>
    },

    async apply(orgId, plan) {
      await db.transaction(async (tx) => {
        if (plan.inserts.length > 0) {
          await tx.insert(categorySuggestions).values(plan.inserts.map((s) => valores(orgId, s))).onConflictDoNothing()
        }
        for (const { id, suggestion } of plan.updates) {
          await tx
            .update(categorySuggestions)
            .set({ ...valores(orgId, suggestion), updatedAt: new Date() })
            .where(and(eq(categorySuggestions.id, id), eq(categorySuggestions.status, 'pending')))
        }
        if (plan.deleteIds.length > 0) {
          await tx
            .delete(categorySuggestions)
            .where(and(inArray(categorySuggestions.id, plan.deleteIds), eq(categorySuggestions.status, 'pending')))
        }
      })
    },
  }
}
