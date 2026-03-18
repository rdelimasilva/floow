---
phase: 03-investments-engine
plan: "03"
subsystem: ui
tags: [recharts, react-server-components, investments, charts, patrimony]

# Dependency graph
requires:
  - phase: 03-investments-engine plan 01
    provides: computePosition, aggregateIncome, estimateMonthlyIncome pure functions in core-finance
  - phase: 03-investments-engine plan 02
    provides: getPositions, getIncomeEvents, DB queries in investments/queries.ts
  - phase: 02-finance-engine plan 04
    provides: computeSnapshot/computeAndSaveSnapshot patrimony engine, refreshSnapshot action

provides:
  - Investment dashboard RSC page (/investments/dashboard) with portfolio summary, allocation pie chart, net worth line chart
  - Income dashboard RSC page (/investments/income) with monthly passive income estimate and stacked bar chart
  - PortfolioSummaryRow component: three stat cards (total value, PnL, dividends)
  - AllocationChart: PieChart grouped by asset class with color coding
  - NetWorthEvolution: LineChart showing patrimony snapshots over time
  - IncomeChart: stacked BarChart (dividend/interest/amortization) by month
  - getPatrimonySnapshots query: historical snapshot retrieval for net worth evolution
  - computeSnapshot extended with optional investmentValueCents parameter
  - refreshSnapshot action now includes portfolio value in net worth calculation

affects: [04-projections, phase-04, future-phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RSC parallel fetch with Promise.all for multiple queries
    - Client chart components import directly from submodule (not barrel) to avoid ofx-js bundling
    - ChartContainer with min-h-[300px] mandatory for Recharts visibility
    - investmentValueCents optional param with default 0 for backward-compatible extension

key-files:
  created:
    - apps/web/app/(app)/investments/dashboard/page.tsx
    - apps/web/app/(app)/investments/income/page.tsx
    - apps/web/components/investments/allocation-chart.tsx
    - apps/web/components/investments/net-worth-evolution.tsx
    - apps/web/components/investments/portfolio-summary-row.tsx
    - apps/web/components/investments/income-chart.tsx
  modified:
    - packages/core-finance/src/snapshot.ts
    - packages/core-finance/src/snapshot-db.ts
    - apps/web/lib/investments/queries.ts
    - apps/web/lib/finance/actions.ts

key-decisions:
  - "investmentValueCents optional param with default 0 in computeSnapshot — backward compatible, Phase 2 callers unchanged"
  - "refreshSnapshot wraps getPositions in try/catch — graceful fallback to 0 if investments table unavailable"
  - "Client chart components import from @floow/core-finance/src/balance submodule not barrel — prevents ofx-js (Node-only) bundling into browser"
  - "getPatrimonySnapshots uses gte(snapshotDate, cutoff) filter — limits data to last N months for chart performance"

patterns-established:
  - "Pattern: Extend pure function with optional param (default 0) for backward compatibility when adding new data sources"
  - "Pattern: RSC income/dashboard pages compute aggregations server-side using core-finance pure functions, pass serializable data to client chart components"

requirements-completed: [DASH-02, DASH-03, DASH-04]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 3 Plan 03: Investment Dashboards Summary

**Three investment visualization dashboards built with Recharts RSC pages: portfolio allocation pie chart, net worth evolution line chart, income stacked bar chart, and patrimony snapshot extended to include investment portfolio value.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T03:32:09Z
- **Completed:** 2026-03-11T03:43:22Z
- **Tasks:** 3
- **Files modified:** 10 (4 modified, 6 created)

## Accomplishments

- Investment dashboard (DASH-02, DASH-03): RSC page with parallel fetch, PortfolioSummaryRow stat cards, AllocationChart pie chart grouped by asset class, NetWorthEvolution line chart over 12 months
- Income dashboard (DASH-04): RSC page with monthly passive income estimate card, IncomeChart stacked bar chart (dividend/interest/amortization), recent events table
- Patrimony snapshot extended: computeSnapshot now includes investmentValueCents in liquid assets and breakdown JSON; refreshSnapshot action sums portfolio positions before saving

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend snapshot + add dashboard queries** - `c0cdf1b` (feat)
2. **Task 2: Investment dashboard page (DASH-02 + DASH-03)** - `53edf4b` (feat)
3. **Task 3: Income dashboard page (DASH-04)** - `3624aeb` (feat)

## Files Created/Modified

- `packages/core-finance/src/snapshot.ts` - Extended computeSnapshot with optional investmentValueCents param (default 0, backward compatible)
- `packages/core-finance/src/snapshot-db.ts` - computeAndSaveSnapshot passes investmentValueCents through
- `apps/web/lib/investments/queries.ts` - Added getPatrimonySnapshots query (historical snapshots for chart)
- `apps/web/lib/finance/actions.ts` - refreshSnapshot now fetches positions and sums currentValueCents
- `apps/web/app/(app)/investments/dashboard/page.tsx` - RSC: parallel fetch positions + snapshots, renders summary/chart/evolution
- `apps/web/app/(app)/investments/income/page.tsx` - RSC: aggregates income events, renders estimate + chart + table
- `apps/web/components/investments/allocation-chart.tsx` - PieChart by asset class with ASSET_CLASS_COLORS/LABELS
- `apps/web/components/investments/net-worth-evolution.tsx` - LineChart of patrimony snapshots
- `apps/web/components/investments/portfolio-summary-row.tsx` - Three stat cards: value, PnL (green/red), dividends
- `apps/web/components/investments/income-chart.tsx` - Stacked BarChart: dividend/interest/amortization

## Decisions Made

- **investmentValueCents as optional param (default 0):** Maintains backward compatibility — Phase 2 callers (tests, old code paths) continue working unchanged. Only refreshSnapshot opts in by passing the value.
- **try/catch in refreshSnapshot:** If the investments table is unavailable or getPositions throws (e.g., during DB migrations), snapshot falls back to investmentValueCents = 0 instead of failing the entire refresh.
- **Submodule imports in client components:** `formatBRL` imported from `@floow/core-finance/src/balance` (not barrel index) to prevent webpack from bundling `ofx-js` (Node.js-only) into the browser bundle — consistent with Phase 02-04 decision.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing typecheck error in `packages/core-finance/src/import/ofx.ts` (argument type mismatch). Not caused by this plan's changes — logged as out-of-scope per deviation boundary rules.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All three investment dashboards fully functional: /investments/dashboard (DASH-02, DASH-03), /investments/income (DASH-04)
- Patrimony snapshots now include investment portfolio value, making net worth calculation holistic
- Phase 3 requirements DASH-02, DASH-03, DASH-04 complete
- Ready for Phase 4 projections if planned, or phase completion

---
*Phase: 03-investments-engine*
*Completed: 2026-03-11*
