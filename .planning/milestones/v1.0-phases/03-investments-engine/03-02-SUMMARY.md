---
phase: 03-investments-engine
plan: 02
subsystem: investments
tags: [drizzle, nextjs, react-hook-form, server-actions, portfolio, investments, pnl]

# Dependency graph
requires:
  - phase: 03-investments-engine
    plan: 01
    provides: "Drizzle schema for assets/portfolioEvents/assetPrices, computePosition pure function, createAssetSchema/createPortfolioEventSchema"
  - phase: 02-finance-engine
    provides: "getOrgId, getAccounts, db.transaction pattern, formatBRL, server action patterns"
provides:
  - "createAsset, createPortfolioEvent (INV-07 db.transaction cash flow integration), updateAssetPrice server actions"
  - "getAssets, getPortfolioEvents, getPositions, getLatestPrices, getPriceHistory, getIncomeEvents query helpers"
  - "/investments RSC page with position table showing computed PnL"
  - "/investments/new RSC page with asset registration and portfolio event forms"
  - "PositionTable client component with PnL color coding, totals row, inline price update, expandable price history"
  - "PriceHistoryPanel client component showing chronological price entry log (INV-06)"
  - "AssetForm client component with react-hook-form + zodResolver"
  - "PortfolioEventForm client component with conditional field visibility by event type"
  - "Investimentos nav link in app layout"
affects:
  - 03-03-PLAN.md
  - 03-04-PLAN.md

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INV-07 cash flow integration: db.transaction() atomically inserts portfolioEvent + transaction row + balance update + transactionId link-back"
    - "Server action getOrgId() pattern reused from finance queries — no extra DB lookup"
    - "getLatestPrices uses application-level grouping (Map) rather than SQL subquery — simpler for MVP, acceptable at small scale"
    - "getIncomeEvents queries portfolio_events (not transactions) to avoid INV-07 double-counting"
    - "PriceHistoryPanel fetches on mount via server action useEffect — simple, no external state management"
    - "Client component submodule import: formatBRL from @floow/core-finance/src/balance (not barrel) — avoids bundling ofx-js into browser"

key-files:
  created:
    - apps/web/lib/investments/queries.ts
    - apps/web/lib/investments/actions.ts
    - apps/web/app/(app)/investments/layout.tsx
    - apps/web/app/(app)/investments/page.tsx
    - apps/web/app/(app)/investments/new/page.tsx
    - apps/web/components/investments/position-table.tsx
    - apps/web/components/investments/price-history-panel.tsx
    - apps/web/components/investments/asset-form.tsx
    - apps/web/components/investments/portfolio-event-form.tsx
  modified:
    - apps/web/app/(app)/layout.tsx

key-decisions:
  - "CASH_FLOW_EVENT_TYPES map in actions.ts: buy=expense/sign-1, sell/dividend/interest/amortization=income/sign+1, split=null — single source of truth for INV-07 logic"
  - "getPositions filters positions where quantityHeld=0 AND realizedPnL=0 AND totalDividends=0 — keeps fully-sold positions with realized gains visible"
  - "inArray with drizzle enum column requires mutable array type (not readonly as const) — TypeScript overload resolution requirement"
  - "orgId prop threaded through PositionTable -> PriceHistoryPanel as server action requires org context"

patterns-established:
  - "EnrichedPosition type defined in queries.ts alongside query: colocates type with computation logic"
  - "Conditional field visibility in PortfolioEventForm via showQuantity/showPriceCents/showTotalCents/showSplitRatio helper functions — readable and testable"
  - "Auto-compute totalCents for buy/sell from qty*price in PortfolioEventForm — UX convenience"

requirements-completed: [INV-04, INV-06, INV-07]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 03 Plan 02: Investment CRUD Layer Summary

**Investment CRUD with atomic INV-07 cash flow integration: server actions for asset registration, portfolio event logging (db.transaction), manual price tracking, position table with PnL computation, and per-asset expandable price history panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T03:24:23Z
- **Completed:** 2026-03-11T03:29:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- createPortfolioEvent atomically inserts portfolio event + finance transaction + balance update in a single db.transaction() (INV-07)
- getPositions fetches all assets, their events, and latest prices, then calls computePosition() to return enriched positions with unrealizedPnL, avgCost, currentValue, and dividends
- /investments page renders PositionTable with color-coded PnL, inline price update per row, and expandable PriceHistoryPanel showing full chronological price log (INV-06)
- /investments/new has side-by-side AssetForm and PortfolioEventForm with all 6 event types and conditional field visibility

## Task Commits

1. **Task 1: Investment server actions and query helpers** - `1384882` (feat)
2. **Task 2: Investments pages, position table, price history, and forms** - `8cd0adc` (feat)

## Files Created/Modified

- `apps/web/lib/investments/queries.ts` - getAssets, getPortfolioEvents, getLatestPrices, getPriceHistory, getPositions (computes via computePosition), getIncomeEvents
- `apps/web/lib/investments/actions.ts` - createAsset, createPortfolioEvent (INV-07 db.transaction), updateAssetPrice server actions
- `apps/web/app/(app)/investments/layout.tsx` - Sub-navigation tabs for Posicoes / Novo Ativo/Evento
- `apps/web/app/(app)/investments/page.tsx` - RSC: fetches positions, renders PositionTable or empty state
- `apps/web/app/(app)/investments/new/page.tsx` - RSC: fetches accounts + assets, renders AssetForm + PortfolioEventForm
- `apps/web/components/investments/position-table.tsx` - Client: table with PnL color coding, totals row, inline price input, expandable history
- `apps/web/components/investments/price-history-panel.tsx` - Client: fetches price history on mount, compact chronological table (INV-06)
- `apps/web/components/investments/asset-form.tsx` - Client: react-hook-form + zodResolver, 6 asset classes with Portuguese labels, fixed_income helper text
- `apps/web/components/investments/portfolio-event-form.tsx` - Client: conditional fields by event type using showX helpers, Controller for all Select components
- `apps/web/app/(app)/layout.tsx` - Added Investimentos nav link between Transacoes and Plano

## Decisions Made

- `CASH_FLOW_EVENT_TYPES` map centralizes INV-07 logic in one place — buy=expense, sell/income events=income, split=null
- `getPositions` retains sold-out positions if they have realized PnL or dividends — users should see historical gains even after full exit
- `inArray()` with Drizzle enum columns requires mutable `Array<EnumValue>` type annotation (not `as const`) — TypeScript overload resolution issue
- `orgId` threaded through PositionTable props to PriceHistoryPanel because server actions need org context for RLS-compliant queries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed readonly array type error for inArray with Drizzle enum column**
- **Found during:** Task 1 verification (typecheck)
- **Issue:** `const INCOME_TYPES = ['dividend', 'interest', 'amortization'] as const` creates a `readonly` tuple. Drizzle's `inArray` overload for enum columns requires a mutable array type, causing TS2769 type error
- **Fix:** Changed to explicit `Array<'dividend' | 'interest' | 'amortization'>` type annotation
- **Files modified:** `apps/web/lib/investments/queries.ts`
- **Verification:** `pnpm turbo run typecheck --filter=@floow/web` passes cleanly
- **Committed in:** `1384882` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential TypeScript correctness fix. No scope creep. Array literal `as const` is idiomatic TypeScript but Drizzle's enum column overloads require mutable arrays.

## Issues Encountered

None — all tasks executed cleanly after the auto-fix.

## User Setup Required

None - no external service configuration required. SQL migration 00003_investments.sql from Plan 03-01 must already be applied to Supabase.

## Next Phase Readiness

- Investment CRUD layer complete — assets, events, prices, positions all functional
- INV-07 cash flow integration ready — buy/sell/dividend/interest/amortization automatically create matching finance transactions
- getIncomeEvents ready for consumption by 03-03 (income dashboard) and 03-04 (portfolio analytics)
- getPriceHistory and getPositions ready for 03-04 chart consumption

---
*Phase: 03-investments-engine*
*Completed: 2026-03-11*
