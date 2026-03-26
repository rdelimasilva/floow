/**
 * CFO Engine Orchestrator
 *
 * Bridges DB data and pure analyzers from @floow/core-finance.
 * Uses direct Drizzle queries (no RSC cache) because it runs from API routes.
 */

import {
  getDb,
  accounts,
  transactions,
  debts,
  budgetGoals,
  budgetEntries,
  patrimonySnapshots,
  portfolioEvents,
  assets,
  assetPositionSnapshots,
  fixedAssets,
  cfoInsights,
  cfoRuns,
} from '@floow/db'
import { eq, and, gte, desc } from 'drizzle-orm'
import {
  aggregateCashFlow,
  runAnalyzers,
  createAnthropicProvider,
  synthesizeInsights,
  type AllAnalyzerInputs,
  type InsightCategory,
} from '@floow/core-finance'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunCfoEngineOptions {
  categories?: InsightCategory[]
  triggerEvent?: string
}

// ---------------------------------------------------------------------------
// TTL helpers
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function ttlForSeverity(severity: string): Date {
  const now = Date.now()
  if (severity === 'positive') return new Date(now + 7 * DAY_MS)
  if (severity === 'critical') return new Date(now + 12 * HOUR_MS)
  return new Date(now + DAY_MS)
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Run the CFO engine for a given org.
 *
 * 1. Inserts a cfo_runs row (with onConflictDoNothing for debounce).
 * 2. Fetches data for each analyzer category via direct Drizzle queries.
 * 3. Calls runAnalyzers(inputs, categories) from core-finance.
 * 4. Saves resulting insights to cfo_insights with appropriate TTL.
 * 5. Updates the cfo_runs row with completion status.
 */
export async function runCfoEngine(
  orgId: string,
  options: RunCfoEngineOptions = {},
): Promise<{ insightsGenerated: number; runId: string }> {
  const { categories, triggerEvent = 'cron_daily' } = options
  const db = getDb()
  const now = new Date()

  // -------------------------------------------------------------------------
  // Step 1 — Insert cfo_runs row (debounce via onConflictDoNothing)
  // -------------------------------------------------------------------------

  const runType = categories ? categories.join(',') : 'full'

  const [run] = await db
    .insert(cfoRuns)
    .values({
      orgId,
      runType,
      triggerEvent,
      startedAt: now,
      analyzersRun: categories ?? [
        'cash_flow',
        'budget',
        'debt',
        'investment',
        'patrimony',
        'retirement',
        'behavior',
      ],
      insightsGenerated: 0,
    })
    .onConflictDoNothing()
    .returning({ id: cfoRuns.id })

  // If onConflictDoNothing silently dropped the insert, bail out early
  if (!run) {
    return { insightsGenerated: 0, runId: '' }
  }

  const runId = run.id

  try {
    // -----------------------------------------------------------------------
    // Step 2 — Fetch data for each analyzer
    // -----------------------------------------------------------------------

    const thirteenMonthsAgo = new Date(now)
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)
    const thirteenMonthsAgoDate = thirteenMonthsAgo.toISOString().split('T')[0]

    const inputs: AllAnalyzerInputs = {}

    const shouldRun = (cat: InsightCategory) =>
      !categories || categories.includes(cat)

    // -- Cash Flow -----------------------------------------------------------
    if (shouldRun('cash_flow') || shouldRun('behavior') || shouldRun('debt') || shouldRun('retirement')) {
      const txRows = await db
        .select({
          date: transactions.date,
          amountCents: transactions.amountCents,
          type: transactions.type,
          categoryId: transactions.categoryId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.isIgnored, false),
            gte(transactions.date, new Date(thirteenMonthsAgoDate)),
          )
        )

      const accountRows = await db
        .select({
          id: accounts.id,
          name: accounts.name,
          balanceCents: accounts.balanceCents,
        })
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.isActive, true)))

      if (shouldRun('cash_flow')) {
        const monthlyRaw = aggregateCashFlow(txRows)
        const monthlyTotals = monthlyRaw.map((m) => ({
          month: m.month,
          income: m.income,
          expense: m.expense,
        }))

        inputs.cashFlow = {
          monthlyTotals,
          accountBalances: accountRows.map((a) => ({
            accountId: a.id,
            name: a.name,
            balance: a.balanceCents,
          })),
        }
      }

      // -- Behavior ----------------------------------------------------------
      if (shouldRun('behavior')) {
        const behaviorTxs = txRows.map((tx) => {
          const d = tx.date instanceof Date ? tx.date : new Date(tx.date)
          return {
            date: d.toISOString().split('T')[0],
            amount: tx.amountCents,
            category: tx.categoryId ?? 'uncategorized',
            dayOfWeek: d.getDay(),
          }
        })

        // Split into two halves (current vs previous period) for average comparison
        const sorted = [...txRows].sort((a, b) => {
          const da = a.date instanceof Date ? a.date.getTime() : new Date(a.date).getTime()
          const db2 = b.date instanceof Date ? b.date.getTime() : new Date(b.date).getTime()
          return da - db2
        })
        const half = Math.floor(sorted.length / 2)
        const current = sorted.slice(half)
        const previous = sorted.slice(0, half)
        const avg = (arr: typeof sorted) =>
          arr.length ? arr.reduce((s, t) => s + Math.abs(t.amountCents), 0) / arr.length : 0

        inputs.behavior = {
          transactions: behaviorTxs,
          averageTransactionAmount: {
            current: avg(current),
            previous: avg(previous),
          },
        }
      }

      // Keep txRows in scope for monthly income extraction below
      if (shouldRun('debt') || shouldRun('retirement')) {
        const cashFlowMonths = aggregateCashFlow(txRows)
        const last3 = cashFlowMonths.slice(0, 3)
        const avgMonthlyIncome =
          last3.length > 0
            ? last3.reduce((s, m) => s + m.income, 0) / last3.length
            : 0

        // -- Debt ------------------------------------------------------------
        if (shouldRun('debt')) {
          const debtRows = await db
            .select()
            .from(debts)
            .where(and(eq(debts.orgId, orgId), eq(debts.isActive, true)))

          inputs.debt = {
            debts: debtRows.map((d) => ({
              name: d.name,
              balance: d.totalCents,
              monthlyPayment: d.installmentCents,
              interestRate: d.interestRate ? Number(d.interestRate) : 0,
              isOverdraft: false, // overdraft detected via negative account balance in cash flow analyzer
            })),
            monthlyIncome: avgMonthlyIncome,
          }
        }

        // -- Retirement ------------------------------------------------------
        if (shouldRun('retirement')) {
          const latestSnapshot = await db
            .select({ netWorthCents: patrimonySnapshots.netWorthCents })
            .from(patrimonySnapshots)
            .where(eq(patrimonySnapshots.orgId, orgId))
            .orderBy(desc(patrimonySnapshots.snapshotDate))
            .limit(1)

          const netWorth = latestSnapshot[0]?.netWorthCents ?? 0
          const savingsRate =
            avgMonthlyIncome > 0
              ? Math.max(
                  0,
                  (avgMonthlyIncome -
                    cashFlowMonths
                      .slice(0, 3)
                      .reduce((s, m) => s + Math.abs(m.expense), 0) /
                      (last3.length || 1)) /
                    avgMonthlyIncome,
                )
              : 0

          inputs.retirement = {
            plan: null, // retirement plan support deferred
            currentSavingsRate: savingsRate,
            netWorth,
          }
        }
      }
    }

    // -- Budget --------------------------------------------------------------
    if (shouldRun('budget')) {
      const goalRows = await db
        .select()
        .from(budgetGoals)
        .where(and(eq(budgetGoals.orgId, orgId), eq(budgetGoals.isActive, true)))

      const entryRows = await db
        .select()
        .from(budgetEntries)
        .where(eq(budgetEntries.orgId, orgId))

      inputs.budget = {
        goals: goalRows.map((g) => ({
          category: g.name,
          limit: g.targetCents,
          spent: 0, // actual spend comes from transaction matching — summary placeholder
          period: g.period,
        })),
        historicalUsage: entryRows.map((e) => ({
          category: e.name ?? e.type,
          month: e.startMonth instanceof Date
            ? e.startMonth.toISOString().split('T')[0].slice(0, 7)
            : String(e.startMonth).slice(0, 7),
          spent: e.plannedCents,
        })),
      }
    }

    // -- Investment ----------------------------------------------------------
    if (shouldRun('investment')) {
      const positionRows = await db
        .select({
          ticker: assets.ticker,
          assetClass: assets.assetClass,
          currentValueCents: assetPositionSnapshots.currentValueCents,
          unrealizedPnLPercentBps: assetPositionSnapshots.unrealizedPnLPercentBps,
          totalDividendsCents: assetPositionSnapshots.totalDividendsCents,
        })
        .from(assetPositionSnapshots)
        .innerJoin(assets, eq(assetPositionSnapshots.assetId, assets.id))
        .where(eq(assetPositionSnapshots.orgId, orgId))

      const totalInvested = positionRows.reduce(
        (s, p) => s + p.currentValueCents,
        0,
      )
      const totalDividends = positionRows.reduce(
        (s, p) => s + p.totalDividendsCents,
        0,
      )

      inputs.investment = {
        positions: positionRows.map((p) => ({
          asset: p.ticker,
          class: p.assetClass,
          allocation:
            totalInvested > 0
              ? (p.currentValueCents / totalInvested) * 100
              : 0,
          pnlPercent: p.unrealizedPnLPercentBps / 100, // bps → percent
        })),
        totalInvested,
        dividendsReceived: totalDividends,
        dividendsExpected: 0, // forward dividend expectation not yet modelled
      }
    }

    // -- Patrimony -----------------------------------------------------------
    if (shouldRun('patrimony')) {
      const snapshotRows = await db
        .select({
          snapshotDate: patrimonySnapshots.snapshotDate,
          netWorthCents: patrimonySnapshots.netWorthCents,
          liquidAssetsCents: patrimonySnapshots.liquidAssetsCents,
        })
        .from(patrimonySnapshots)
        .where(eq(patrimonySnapshots.orgId, orgId))
        .orderBy(desc(patrimonySnapshots.snapshotDate))
        .limit(2)

      const fixedAssetRows = await db
        .select({
          name: fixedAssets.name,
          currentValueCents: fixedAssets.currentValueCents,
          purchaseValueCents: fixedAssets.purchaseValueCents,
        })
        .from(fixedAssets)
        .where(and(eq(fixedAssets.orgId, orgId), eq(fixedAssets.isActive, true)))

      inputs.patrimony = {
        snapshots: snapshotRows.map((s) => ({
          month:
            s.snapshotDate instanceof Date
              ? s.snapshotDate.toISOString().split('T')[0].slice(0, 7)
              : String(s.snapshotDate).slice(0, 7),
          netWorth: s.netWorthCents,
          liquidAssets: s.liquidAssetsCents,
        })),
        fixedAssets: fixedAssetRows.map((f) => ({
          name: f.name,
          currentValue: f.currentValueCents,
          previousValue: f.purchaseValueCents,
        })),
      }
    }

    // -----------------------------------------------------------------------
    // Step 3 — Run analyzers
    // -----------------------------------------------------------------------

    const insights = runAnalyzers(inputs, categories)

    // -----------------------------------------------------------------------
    // Step 3b — LLM synthesis (optional, requires ANTHROPIC_API_KEY)
    // -----------------------------------------------------------------------

    let dailySummary: string | null = null

    if (insights.length > 0 && process.env.ANTHROPIC_API_KEY) {
      const provider = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })

      // Build financial context from the inputs we already fetched
      const financialContext = {
        monthlyIncome: inputs.cashFlow?.monthlyTotals[0]?.income ?? 0,
        monthlyExpenses: Math.abs(inputs.cashFlow?.monthlyTotals[0]?.expense ?? 0),
        netWorth: inputs.patrimony?.snapshots[0]?.netWorth ?? 0,
        debtTotal: inputs.debt?.debts.reduce((s, d) => s + d.balance, 0) ?? 0,
        investmentTotal: inputs.investment?.totalInvested ?? 0,
        savingsRate: inputs.retirement?.currentSavingsRate ?? 0,
        topCategories: [] as { name: string; amount: number }[],
      }

      const result = await synthesizeInsights(provider, insights, financialContext)

      if (result) {
        // Merge LLM text into insights (1:1 by index)
        for (let i = 0; i < insights.length; i++) {
          const llmInsight = result.synthesized.prioritizedInsights[i]
          if (llmInsight) {
            insights[i] = { ...insights[i], title: llmInsight.title, body: llmInsight.body }
          }
        }
        dailySummary = result.synthesized.dailySummary

        await db
          .update(cfoRuns)
          .set({ llmCalled: true, dailySummary })
          .where(eq(cfoRuns.id, run.id))
      }
    }

    // -----------------------------------------------------------------------
    // Step 4 — Save insights
    // -----------------------------------------------------------------------

    if (insights.length > 0) {
      const generatedAt = new Date()
      await db.insert(cfoInsights).values(
        insights.map((insight) => ({
          orgId,
          type: insight.type,
          category: insight.category,
          severity: insight.severity,
          title: insight.title,
          body: insight.body,
          metric: insight.metric,
          suggestedActionType: insight.suggestedAction?.type ?? null,
          suggestedActionParams: insight.suggestedAction?.params ?? null,
          source: triggerEvent,
          generatedAt,
          expiresAt: ttlForSeverity(insight.severity),
        })),
      )
    }

    // -----------------------------------------------------------------------
    // Step 5 — Update cfo_runs with completion
    // -----------------------------------------------------------------------

    await db
      .update(cfoRuns)
      .set({
        completedAt: new Date(),
        insightsGenerated: insights.length,
      })
      .where(eq(cfoRuns.id, runId))

    return { insightsGenerated: insights.length, runId }
  } catch (error) {
    // Record the error in the run row so it's observable
    await db
      .update(cfoRuns)
      .set({
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(cfoRuns.id, runId))

    throw error
  }
}
