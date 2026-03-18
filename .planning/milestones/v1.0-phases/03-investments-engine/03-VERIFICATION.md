---
phase: 03-investments-engine
verified: 2026-03-17T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
human_verification:
  - test: "Register an asset and log a buy event, then verify the /transactions page shows a corresponding expense entry"
    expected: "A new expense transaction appears for the buy amount, and the linked account balance is reduced accordingly"
    why_human: "Requires a live database with real accounts. The db.transaction() atomicity and balance update cannot be confirmed via static analysis alone."
  - test: "Log a dividend event for an asset and verify it appears as income in /transactions and in /investments/income"
    expected: "An income transaction appears in /transactions; the income dashboard shows the dividend in the chart and updates the monthly estimate"
    why_human: "Cross-page cash flow integration (INV-07) must be observed end-to-end in the running app."
  - test: "Enter two different prices for an asset via the inline price update in the position table, then expand the price history panel"
    expected: "Both price entries appear in chronological order in the Historico de Precos panel, and the PnL column reflects the most recent price"
    why_human: "Requires a running browser to confirm the expandable panel renders the PriceHistoryPanel component with real data from the DB."
  - test: "Log a split event for an asset (splitRatio=2.0) and verify the position table reflects doubled quantity and halved average cost"
    expected: "Position row shows qty * 2 and avgCost / 2 with total cost basis unchanged"
    why_human: "Requires live data; the arithmetic is verified by unit tests, but the end-to-end form submission and rendering must be confirmed."
  - test: "Trigger a patrimony snapshot refresh from /dashboard and verify the /investments/dashboard net worth evolution chart gains a new data point"
    expected: "The LineChart on /investments/dashboard shows the new snapshot point including the investment portfolio value"
    why_human: "Requires running app with existing snapshot data; the computeSnapshot extension is code-verified but the visual chart display must be confirmed."
---

# Phase 03: Investments Engine Verification Report

**Phase Goal:** Users can manage their complete investment portfolio across all asset classes, see consolidated positions with PnL, and visualize wealth evolution
**Verified:** 2026-03-17
**Status:** human_needed — all automated checks pass; 5 items require browser verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can register assets across all classes and log portfolio events | VERIFIED | `createAsset` + `createPortfolioEvent` server actions with full Zod validation; AssetForm + PortfolioEventForm client components with conditional field visibility; 6 asset classes and 6 event types all present |
| 2 | User can see consolidated position with automatic average price calculation per asset | VERIFIED | `getPositions()` in queries.ts calls `computePosition()` for each asset; PositionTable renders qty, PM, current value, PnL per row with totals row |
| 3 | User can view PnL per asset and total portfolio, plus dividends and income details | VERIFIED | PositionTable shows unrealizedPnLCents (% and R$), totalDividendsCents per row; PortfolioSummaryRow shows totalPnLCents and totalDividendsCents; income page shows estimateMonthlyIncome |
| 4 | Investment events automatically integrate with cash flow | VERIFIED | `createPortfolioEvent` uses `db.transaction()` to atomically insert portfolioEvent + transactions row + balance update; CASH_FLOW_EVENT_TYPES map covers buy/sell/dividend/interest/amortization; split=null correctly skipped |
| 5 | Investment dashboard shows portfolio value, PnL, and allocation chart by asset class | VERIFIED | `/investments/dashboard` RSC with Promise.all; PortfolioSummaryRow (3 stat cards); AllocationChart (PieChart with per-class colors and Portuguese labels); ChartContainer with min-h-[300px] |
| 6 | Net worth evolution chart displays how total patrimony changed over time | VERIFIED | NetWorthEvolution component (LineChart); `getPatrimonySnapshots` query; `refreshSnapshot` in finance/actions.ts extended to sum `investmentValueCents` from positions before calling `computeSnapshot` |
| 7 | Income dashboard shows dividend history, interest, and estimated monthly passive income | VERIFIED | `/investments/income` RSC fetches `getIncomeEvents`, calls `aggregateIncome` + `estimateMonthlyIncome`; IncomeChart (stacked BarChart); prominent monthly estimate card; IncomeEventTable for recent events |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/investments.ts` | 3 tables, 2 enums, 6 inferred types | VERIFIED | assetClassEnum (6 values), eventTypeEnum (6 values), assets/portfolioEvents/assetPrices tables with correct columns; PortfolioEventRow, NewPortfolioEventRow, Asset, NewAsset, AssetPrice, NewAssetPrice exported |
| `supabase/migrations/00003_investments.sql` | CREATE TABLE + indexes + RLS for 3 tables | VERIFIED | All 3 tables created, 6 indexes, RLS ENABLE + 4 policies per table (SELECT/INSERT/UPDATE/DELETE) using `get_user_org_ids()` pattern |
| `packages/shared/src/schemas/investments.ts` | Zod schemas for asset and event creation | VERIFIED | createAssetSchema, createPortfolioEventSchema, updateAssetSchema, updatePortfolioEventSchema; inferred input types exported |
| `packages/core-finance/src/portfolio.ts` | computePosition pure function | VERIFIED | PortfolioEventInput, PositionResult interfaces; buy/sell/split/dividend/interest/amortization all handled; chronological sort; Math.round() for integer cents |
| `packages/core-finance/src/income.ts` | aggregateIncome + estimateMonthlyIncome | VERIFIED | IncomeEvent, IncomeMonth interfaces; UTC date methods for timezone safety; descending sort; Set-based INCOME_EVENT_TYPES filter |
| `packages/core-finance/src/__tests__/portfolio.test.ts` | 10+ TDD tests | VERIFIED | 11 test cases: empty, single buy, two buys weighted avg, partial sell, full sell, profit sell, loss sell, 2-for-1 split, dividend accumulation, chronological order, interest events |
| `packages/core-finance/src/__tests__/income.test.ts` | 7+ TDD tests | VERIFIED | 10 test cases: empty, single dividend, same-month aggregation, cross-month sort, mixed types, buy/sell filtered, split filtered, estimate-0, estimate-average, estimate-fewer-months |
| `apps/web/lib/investments/queries.ts` | 6 query helpers | VERIFIED | getAssets, getPortfolioEvents, getPortfolioEventById, getLatestPrices, getPriceHistory, getPositions (with computePosition), getIncomeEvents, getPatrimonySnapshots — all substantive implementations |
| `apps/web/lib/investments/actions.ts` | 3+ server actions | VERIFIED | createAsset, createPortfolioEvent (INV-07 with db.transaction), updateAssetPrice, deleteAsset, updateAsset, deletePortfolioEvent, updatePortfolioEvent — full CRUD beyond plan minimum |
| `apps/web/app/(app)/investments/page.tsx` | RSC position page | VERIFIED | Calls getPositions, renders PositionTable or empty state with CTA; "Investimentos" heading |
| `apps/web/app/(app)/investments/dashboard/page.tsx` | RSC dashboard page | VERIFIED | Promise.all for getPositions + getPatrimonySnapshots; PortfolioSummaryRow + AllocationChart + NetWorthEvolution; empty state with CTA |
| `apps/web/app/(app)/investments/income/page.tsx` | RSC income page | VERIFIED | getIncomeEvents + aggregateIncome + estimateMonthlyIncome; monthly estimate card + IncomeChart + IncomeEventTable; empty state with CTA |
| `apps/web/components/investments/position-table.tsx` | Client position table | VERIFIED | Ticker/Nome/Classe/Qtd/PM/Preço Atual/Valor Atual/P&L(%)/P&L(R$)/Dividendos columns; color-coded PnL; totals row; inline price update per row; expandable PriceHistoryPanel |
| `apps/web/components/investments/price-history-panel.tsx` | Client price history panel | VERIFIED | Fetches via client-actions.ts server action wrapper on mount; chronological table; empty state "Nenhum preço registrado" |
| `apps/web/components/investments/asset-form.tsx` | Client asset registration form | VERIFIED | react-hook-form + zodResolver; 6 asset class options with Portuguese labels; fixed_income helper text; createAsset server action |
| `apps/web/components/investments/portfolio-event-form.tsx` | Client event logging form | VERIFIED | Conditional field visibility (showQuantity/showPriceCents/showTotalCents/showSplitRatio helpers); auto-compute totalCents for buy/sell; createPortfolioEvent server action |
| `apps/web/components/investments/allocation-chart.tsx` | PieChart by asset class | VERIFIED | PieChart + Pie + Cell from recharts; ChartContainer with min-h-[300px]; 6 ASSET_CLASS_COLORS + Portuguese ASSET_CLASS_LABELS; positions grouped by assetClass |
| `apps/web/components/investments/net-worth-evolution.tsx` | LineChart for patrimony snapshots | VERIFIED | LineChart from recharts; ChartContainer with min-h-[300px]; snapshotDate mapped to formatted date labels; stroke=#2563eb, dot=false |
| `apps/web/components/investments/income-chart.tsx` | Stacked BarChart for income | VERIFIED | BarChart + 3 stacked Bars (dividendCents/interestCents/amortizationCents); ChartContainer with min-h-[300px]; reversed for chronological display |
| `apps/web/components/investments/portfolio-summary-row.tsx` | 3 stat cards | VERIFIED | Valor Total, P&L Total (green/red), Dividendos Totais; formatBRL on all values |
| `packages/core-finance/src/snapshot.ts` | Extended computeSnapshot | VERIFIED | Optional `investmentValueCents` param (default 0); adds to liquidAssetsCents; adds 'investments' key to breakdown JSON; backward compatible |
| `apps/web/lib/finance/actions.ts` (refreshSnapshot) | Includes investment value in snapshot | VERIFIED | Imports getPositions; sums currentValueCents with reduce; passes to computeSnapshot; wrapped in try/catch for graceful fallback |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/db/src/schema/investments.ts` | `packages/db/src/schema/auth.ts` | `orgs` FK reference | WIRED | `references(() => orgs.id, { onDelete: 'cascade' })` on all 3 tables |
| `packages/db/src/index.ts` | `packages/db/src/schema/investments.ts` | barrel re-export | WIRED | `export * from './schema/investments'` at line 5 |
| `packages/db/src/client.ts` | `packages/db/src/schema/investments.ts` | fullSchema spread | WIRED | `import * as investmentsSchema` + `...investmentsSchema` in fullSchema |
| `apps/web/lib/investments/actions.ts` | `packages/db/src/schema/investments.ts` | `db.transaction()` insert | WIRED | `db.transaction(async (tx) => { ... insert(portfolioEvents) ... insert(transactions) ... })` confirmed at line 142 |
| `apps/web/lib/investments/queries.ts` | `packages/core-finance/src/portfolio.ts` | `computePosition` called per asset | WIRED | `import { computePosition } from '@floow/core-finance'` at line 10; called at line 228 inside getPositions |
| `apps/web/lib/investments/queries.ts` | `packages/db/src/schema/investments.ts` | `getPriceHistory` queries assetPrices | WIRED | `from(assetPrices).where(eq(assetPrices.orgId, orgId), eq(assetPrices.assetId, assetId))` confirmed |
| `apps/web/app/(app)/investments/page.tsx` | `apps/web/lib/investments/queries.ts` | RSC calls getPositions | WIRED | `import { getPositions }` + `await getPositions(orgId)` confirmed |
| `apps/web/lib/investments/actions.ts` | `packages/db/src/schema/finance.ts` | INV-07 inserts transactions row | WIRED | `insert(transactions).values(...)` inside db.transaction at line 178; `sql\`balance_cents + ${signedAmount}\`` balance update confirmed |
| `apps/web/app/(app)/investments/dashboard/page.tsx` | `apps/web/lib/investments/queries.ts` | `Promise.all` parallel fetch | WIRED | `const [positions, snapshots] = await Promise.all([getPositions(orgId), getPatrimonySnapshots(orgId, 12)])` confirmed |
| `apps/web/app/(app)/investments/income/page.tsx` | `apps/web/lib/investments/queries.ts` | `getIncomeEvents` called | WIRED | `import { getIncomeEvents }` + `await getIncomeEvents(orgId, 12)` confirmed |
| `apps/web/components/investments/allocation-chart.tsx` | recharts | `PieChart` with ChartContainer | WIRED | `import { PieChart, Pie, Cell } from 'recharts'`; `<ChartContainer config={chartConfig} className="min-h-[300px] w-full">` confirmed |
| `apps/web/components/investments/net-worth-evolution.tsx` | recharts | `LineChart` with ChartContainer | WIRED | `import { LineChart, Line, XAxis, CartesianGrid } from 'recharts'`; `<ChartContainer ... className="min-h-[300px] w-full">` confirmed |
| `apps/web/lib/finance/actions.ts` (refreshSnapshot) | `apps/web/lib/investments/queries.ts` | getPositions for investment value | WIRED | `import { getPositions }` at line 9; `positions.reduce((sum, p) => sum + p.currentValueCents, 0)` passed to `computeSnapshot` at line 217 |
| Sidebar nav | `/investments` route | Investimentos link | WIRED | `{ href: '/investments', label: 'Investimentos', icon: TrendingUp }` in sidebar.tsx confirmed |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INV-01 | 03-01, 03-04 | User can register assets (ações BR, FIIs, ETFs, cripto, renda fixa, internacional) | SATISFIED | assetClassEnum with 6 values; createAsset server action; AssetForm with all 6 classes |
| INV-02 | 03-01, 03-04 | User can register holding events (compra, venda, dividendo, juros, split, amortização) | SATISFIED | eventTypeEnum with 6 values; createPortfolioEvent; PortfolioEventForm with conditional fields |
| INV-03 | 03-01, 03-04 | User can view consolidated position with average price | SATISFIED | getPositions calls computePosition; PositionTable shows PM (avgCostCents) per asset |
| INV-04 | 03-02, 03-04 | User can view dividends and income details | SATISFIED | totalDividendsCents in PositionTable; /investments/income page with IncomeChart and IncomeEventTable |
| INV-05 | 03-01, 03-04 | User can view PnL per asset and total | SATISFIED | unrealizedPnLCents (% and R$) per row; totals row; PortfolioSummaryRow totalPnLCents |
| INV-06 | 03-02, 03-04 | User can view historical prices and asset evolution | SATISFIED | getPriceHistory query; PriceHistoryPanel fetches on mount; expandable per-row in PositionTable |
| INV-07 | 03-02, 03-04 | Investment events integrate with cash flow | SATISFIED (needs human confirmation) | CASH_FLOW_EVENT_TYPES map; db.transaction atomically inserts portfolioEvent + transactions + balance update |
| DASH-02 | 03-03, 03-04 | Investment dashboard (portfolio, current value, PnL, allocation chart) | SATISFIED | /investments/dashboard with PortfolioSummaryRow + AllocationChart |
| DASH-03 | 03-03, 03-04 | Net worth evolution chart | SATISFIED | NetWorthEvolution LineChart; getPatrimonySnapshots; refreshSnapshot extended with investmentValueCents |
| DASH-04 | 03-03, 03-04 | Income dashboard (dividends, interest, monthly passive income) | SATISFIED | /investments/income with IncomeChart + monthly estimate card |

All 10 requirements are covered by their declared plans. No orphaned requirements found — REQUIREMENTS.md traceability table shows all INV-01 through INV-07 and DASH-02/03/04 mapped to Phase 3 with status "Complete".

---

### Anti-Patterns Found

No anti-patterns detected. Scanned all key files for TODO/FIXME/XXX/PLACEHOLDER, empty implementations, and stub patterns. No issues found.

Notable quality observations:
- `return null` in `getPortfolioEventById` (queries.ts:104) — correct logic for missing entity, not a stub
- `return []` in `aggregateIncome` (income.ts:52, 61) — correct early-return for empty/no-income input, not a stub
- `PortfolioSummaryRow` imports `formatBRL` from barrel (`@floow/core-finance`) — this is a Server Component (no 'use client'), so barrel import is safe; no browser bundling concern

---

### Human Verification Required

#### 1. Cash Flow Integration (INV-07)

**Test:** Register an asset (e.g., PETR4), log a Buy event (qty=100, priceCents=2850, accountId=brokerage account), then navigate to /transactions and /accounts
**Expected:** A new expense transaction appears in /transactions for -R$2,850.00; the brokerage account balance is reduced by the same amount
**Why human:** The `db.transaction()` atomicity and balance update correctness requires a live Supabase database. Static analysis confirms the code path, but execution correctness cannot be verified without a running environment.

#### 2. Dividend Cash Flow (INV-07 income side)

**Test:** Log a Dividend event for an asset (totalCents=4500), then check /transactions and /investments/income
**Expected:** An income transaction appears in /transactions for +R$45.00; the income dashboard bar chart shows the dividend in the current month; monthly estimate updates
**Why human:** Same reason as above — cross-page cash flow integration requires browser + live DB to confirm.

#### 3. Price History Panel Display (INV-06)

**Test:** Use the inline price update to enter two different prices for an asset (e.g., R$32.00 then R$33.50), then click "Histórico" in the position table row
**Expected:** PriceHistoryPanel expands and shows both entries in chronological order (oldest first); "Nenhum preço registrado" shown for an asset with no prices
**Why human:** The PriceHistoryPanel fetches on mount via useEffect + server action. Rendering requires a running browser to confirm the panel actually loads and displays data.

#### 4. Split Event Calculation (INV-02 edge case)

**Test:** Log a Buy then a Split event (splitRatio=2.0) for an asset and navigate to /investments
**Expected:** Position row shows doubled quantity, halved average cost, unchanged total cost basis (e.g., 100 shares at R$20.00 → 200 shares at R$10.00, total cost = R$2,000 in both cases)
**Why human:** The computation is unit-tested (11 tests pass), but the end-to-end form submission through the `splitRatio` field and correct rendering in PositionTable must be confirmed.

#### 5. Net Worth Evolution Chart with Investment Value (DASH-03)

**Test:** With some investment positions having a current price, click "Atualizar Patrimônio" on the financial dashboard (/dashboard), then navigate to /investments/dashboard
**Expected:** The net worth line chart gains a new data point; the snapshot value is higher than the accounts-only value by approximately the total investment portfolio value
**Why human:** Requires a running app with existing snapshot data and investment positions with current prices to observe the chart update visually.

---

### Summary

Phase 3 delivered a complete, production-quality investments engine with no stubs or placeholders found. All 7 observable truths are verified against actual code:

**Schema layer:** Three Drizzle tables (assets, portfolio_events, asset_prices) with a matching SQL migration and full RLS policies (SELECT/INSERT/UPDATE/DELETE per table).

**Computation layer:** Two pure functions (`computePosition`, `aggregateIncome`) with comprehensive TDD coverage (11 + 10 tests). Split handling, weighted average cost, realized PnL, income aggregation, and monthly estimation all verified.

**CRUD layer:** Full server actions beyond the plan minimum — create, update, delete for both assets and portfolio events, with INV-07 cash flow integration using `db.transaction()` atomicity. The `CASH_FLOW_EVENT_TYPES` map correctly handles buy (expense/-1), sell/dividend/interest/amortization (income/+1), and split (null/no cash flow).

**UI layer:** Position table with PnL color coding, totals row, inline price update, and expandable price history panel per row. Asset and portfolio event forms with conditional field visibility.

**Dashboard layer:** Three dashboards (investment, income, net worth evolution) built with Recharts and ChartContainer min-h-[300px] pattern. Patrimony snapshots correctly extended to include investment portfolio value.

**Navigation:** "Investimentos" link wired in the sidebar (not in the app layout as originally planned, but in the Sidebar component which achieves the same visible result).

The five human verification items are behavioral/visual tests that cannot be confirmed via static analysis. All automated checks pass.

---

*Verified: 2026-03-17*
*Verifier: Claude (gsd-verifier)*
