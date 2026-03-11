---
phase: 03-investments-engine
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, zod, vitest, tdd, investments, portfolio]

# Dependency graph
requires:
  - phase: 02-finance-engine
    provides: "orgs FK reference in auth.ts, RLS pattern via get_user_org_ids(), Drizzle schema patterns from finance.ts"
provides:
  - "Drizzle schema: assets, portfolioEvents, assetPrices tables with enums and inferred types"
  - "SQL migration 00003_investments.sql with CREATE TABLE, indexes, RLS policies for all 3 tables"
  - "Zod validation schemas: createAssetSchema, createPortfolioEventSchema"
  - "computePosition pure function: buy/sell/split/dividend with 11 passing TDD tests"
  - "aggregateIncome pure function: monthly grouping with 10 passing TDD tests"
  - "estimateMonthlyIncome: average monthly income over last N months"
affects:
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PortfolioEventRow type naming: DB inferred type named PortfolioEventRow (not PortfolioEvent) to avoid clash with pure function interface"
    - "UTC date methods in income aggregation: getUTCFullYear/getUTCMonth prevent timezone-induced month shifts for UTC midnight dates"
    - "TDD pure function pattern: write failing tests first, implement minimal code to pass, verified isolated from DB"

key-files:
  created:
    - packages/db/src/schema/investments.ts
    - packages/db/src/__tests__/investments-schema.test.ts
    - supabase/migrations/00003_investments.sql
    - packages/shared/src/schemas/investments.ts
    - packages/core-finance/src/portfolio.ts
    - packages/core-finance/src/__tests__/portfolio.test.ts
    - packages/core-finance/src/income.ts
    - packages/core-finance/src/__tests__/income.test.ts
  modified:
    - packages/db/src/index.ts
    - packages/db/src/client.ts
    - packages/shared/src/index.ts
    - packages/core-finance/src/index.ts

key-decisions:
  - "PortfolioEventRow for DB inferred type (not PortfolioEvent) to avoid name clash with pure function PortfolioEventInput interface in portfolio.ts"
  - "UTC date methods in aggregateIncome: getUTCFullYear/getUTCMonth instead of local time getFullYear/getMonth to prevent timezone bugs when dates parsed as UTC midnight strings"
  - "splitRatio stored as string in PortfolioEventInput: numeric precision preserved without floating-point errors, parsed via parseFloat only when needed for computation"
  - "accountId in portfolioEvents is application-level FK (not DB FK to accounts): avoids cross-schema complications, validated at application layer"

patterns-established:
  - "Event processing: always sort by eventDate ascending before computation (computePosition, aggregateIncome)"
  - "Income filtering: Set-based INCOME_EVENT_TYPES for O(1) lookup vs if-else chain"
  - "Integer cents convention maintained via Math.round() after all divisions in financial computations"

requirements-completed: [INV-01, INV-02, INV-03, INV-05]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 03 Plan 01: Investment Schema and Core Engine Summary

**Drizzle schema for 3 investment tables (assets, portfolio_events, asset_prices) with RLS migration, Zod validation, and two TDD-tested pure computation engines (computePosition with 11 tests, aggregateIncome with 10 tests)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T03:15:51Z
- **Completed:** 2026-03-11T03:21:10Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- 3 investment tables defined in Drizzle with matching SQL migration and full RLS policies (SELECT/INSERT/UPDATE/DELETE per table)
- computePosition handles buy, sell, split, dividend/interest events with correct weighted avg cost and realized PnL (11 tests)
- aggregateIncome correctly groups income events by month with per-type breakdown and descending sort (10 tests)

## Task Commits

1. **Task 1: Investment schema, SQL migration, Zod validation** - `95c1277` (feat)
2. **Task 2: computePosition with TDD tests** - `625d939` (feat)
3. **Task 3: aggregateIncome with TDD tests** - `66698fe` (feat)

## Files Created/Modified

- `packages/db/src/schema/investments.ts` - Drizzle schema: assetClassEnum, eventTypeEnum, assets, portfolioEvents, assetPrices tables; inferred types PortfolioEventRow, NewPortfolioEventRow, etc.
- `packages/db/src/__tests__/investments-schema.test.ts` - Schema structure tests (9 tests)
- `supabase/migrations/00003_investments.sql` - SQL migration with CREATE TYPE, CREATE TABLE, indexes, RLS policies for all 3 tables
- `packages/shared/src/schemas/investments.ts` - Zod: createAssetSchema, createPortfolioEventSchema; inferred input types
- `packages/core-finance/src/portfolio.ts` - computePosition pure function with PortfolioEventInput and PositionResult interfaces
- `packages/core-finance/src/__tests__/portfolio.test.ts` - 11 TDD tests covering buy, sell, split, dividend, empty, order-independence
- `packages/core-finance/src/income.ts` - aggregateIncome and estimateMonthlyIncome pure functions with IncomeEvent and IncomeMonth interfaces
- `packages/core-finance/src/__tests__/income.test.ts` - 10 TDD tests covering monthly grouping, type filtering, estimation
- `packages/db/src/index.ts` - Added `export * from './schema/investments'`
- `packages/db/src/client.ts` - Added investmentsSchema to fullSchema
- `packages/shared/src/index.ts` - Added `export * from './schemas/investments'`
- `packages/core-finance/src/index.ts` - Added exports for portfolio and income modules

## Decisions Made

- `PortfolioEventRow` naming for DB inferred type to avoid clash with pure function interface name; pure function uses `PortfolioEventInput`
- UTC date methods (`getUTCFullYear`/`getUTCMonth`) in aggregateIncome to prevent timezone-induced month shifts
- `splitRatio` as string type in pure function interface for numeric precision, converted to float only during computation
- `accountId` in portfolio_events is application-level FK (not DB constraint) to avoid cross-schema complications

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed timezone-induced month classification error in aggregateIncome**
- **Found during:** Task 3 (income tests GREEN phase)
- **Issue:** `new Date('2024-03-01')` creates UTC midnight. `getMonth()` uses local timezone, so in UTC-3 (Brazil) this date becomes Feb 29 23:00 local time — wrong month key `2024-02` instead of `2024-03`
- **Fix:** Changed `getFullYear()/getMonth()` to `getUTCFullYear()/getUTCMonth()` in aggregateIncome
- **Files modified:** `packages/core-finance/src/income.ts`
- **Verification:** All 10 income tests pass after fix
- **Committed in:** `66698fe` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential correctness fix. Without UTC methods, income events on the 1st of any month would be classified in the wrong month for users in UTC- timezones. No scope creep.

## Issues Encountered

**Pre-existing TypeScript error in ofx.ts (deferred, out of scope):** `src/import/ofx.ts:55` has `TS2345: Argument of type 'string | number' is not assignable to parameter of type 'string'`. Confirmed pre-existing before this plan via git stash test. Logged to `deferred-items.md`.

## User Setup Required

None - no external service configuration required. SQL migration must be applied to Supabase when ready.

## Next Phase Readiness

- Schema ready for 03-02 (portfolio server actions and API layer)
- computePosition and aggregateIncome ready for consumption by server actions
- All 3 packages (@floow/db, @floow/shared, @floow/core-finance) pass their tests
- Pre-existing typecheck error in ofx.ts should be addressed before 03-04

---
*Phase: 03-investments-engine*
*Completed: 2026-03-11*
