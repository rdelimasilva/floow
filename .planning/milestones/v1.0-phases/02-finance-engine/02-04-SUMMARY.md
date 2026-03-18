---
phase: 02-finance-engine
plan: 04
subsystem: ui
tags: [dashboard, patrimony, snapshot, react, nextjs, shadcn, vitest, rtl, drizzle]

# Dependency graph
requires:
  - phase: 02-finance-engine
    plan: 02-01
    provides: finance DB schema (accounts, transactions, patrimonySnapshots tables), core-finance balance utilities
  - phase: 02-finance-engine
    plan: 02-02
    provides: account/transaction server actions, getAccounts/getTransactions queries
  - phase: 02-finance-engine
    plan: 02-03
    provides: CashFlowChart component, aggregateCashFlow function, import page with dedup

provides:
  - computeSnapshot pure function and computeAndSaveSnapshot DB-connected function in packages/core-finance
  - Financial dashboard RSC at /dashboard with account summary row, quick stats row, cash flow chart, patrimony card
  - PatrimonySummary client component with net worth, liquid assets, liabilities, and per-type breakdown
  - AccountSummaryRow and QuickStatsRow components
  - getLatestSnapshot and getRecentTransactions query helpers
  - refreshSnapshot server action with revalidatePath
  - RTL tests for dashboard sub-components

affects: [03-investments, 04-projections, any phase needing net-worth or patrimony data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pure snapshot computation (computeSnapshot takes Account[], no DB) + separate DB-connected wrapper (computeAndSaveSnapshot)
    - Direct submodule imports for client components (not barrel index) to prevent webpack bundling Node-only packages
    - db.transaction() wrapping all multi-step financial mutations for atomicity

key-files:
  created:
    - packages/core-finance/src/snapshot.ts
    - packages/core-finance/src/__tests__/snapshot.test.ts
    - apps/web/app/(app)/dashboard/page.tsx
    - apps/web/components/finance/patrimony-summary.tsx
    - apps/web/components/finance/account-summary-row.tsx
    - apps/web/components/finance/quick-stats-row.tsx
    - apps/web/__tests__/finance/dashboard.test.tsx
  modified:
    - packages/core-finance/src/index.ts
    - apps/web/lib/finance/queries.ts
    - apps/web/lib/finance/actions.ts

key-decisions:
  - "computeSnapshot is a pure function taking Account[] — no DB dependency, fully testable in isolation"
  - "Client components import directly from submodule (e.g., @floow/core-finance/snapshot) not barrel index — prevents webpack from bundling ofx-js (Node-only) into the browser bundle"
  - "db.transaction() wraps transfer balance updates and import insertions — replaces two separate atomic SQL calls pattern from Plan 02-02"
  - "Env var validation at startup (fail-fast) added as deviation — prevents silent misconfiguration in production"

patterns-established:
  - "Pure-function core logic + DB wrapper: computeSnapshot(accounts) is pure, computeAndSaveSnapshot(db, orgId) is the DB wrapper — apply to future domain computations"
  - "Submodule imports for client components importing from packages/ that have Node-only transitive deps"

requirements-completed: [DASH-01, VAL-01]

# Metrics
duration: ~90min (including human verification session)
completed: 2026-03-10
---

# Phase 2 Plan 04: Dashboard and Patrimony Snapshot Summary

**Financial dashboard RSC consolidating account balances, monthly cash flow chart, and point-in-time patrimony snapshots computed with a pure function over Account[] data**

## Performance

- **Duration:** ~90 min (including human verification)
- **Started:** 2026-03-10
- **Completed:** 2026-03-10
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 12

## Accomplishments

- Patrimony snapshot engine: pure `computeSnapshot(accounts, orgId)` function computes net worth, liquid assets, liabilities, and per-type breakdown. Six unit tests cover all account type combinations and edge cases (empty accounts, credit card liabilities, mixed accounts).
- Financial dashboard page at `/dashboard` (RSC): fetches accounts, recent transactions, and latest snapshot in parallel; renders AccountSummaryRow, QuickStatsRow, CashFlowChart, and PatrimonySummary with empty-state CTAs when no data exists.
- PatrimonySummary client component displays net worth, liquid assets, liabilities in BRL with a per-type breakdown section and "Update Snapshot" refresh button wired to refreshSnapshot server action.
- RTL test suite for dashboard sub-components covering account card rendering, stats labels, CashFlowChart presence, PatrimonySummary net worth, and empty state CTAs.
- Post-checkpoint fixes: all multi-step financial mutations wrapped in `db.transaction()` for atomicity, and `fail-fast` env var validation added at startup.

## Task Commits

Each task was committed atomically:

1. **Task 1: Patrimony snapshot computation with TDD tests** - `b422514` (feat)
2. **Task 2: Financial dashboard page with RTL tests** - `65cfec2` (feat)
3. **Task 3: Human verification checkpoint** - approved — no code commit (checkpoint approval)

**Deviation commits:**
- `9b3613d` — fix(finance): wrap financial operations in db.transaction for atomicity
- `0bcdf78` — feat(env): fail fast on missing required environment variables

## Files Created/Modified

- `packages/core-finance/src/snapshot.ts` — computeSnapshot (pure) and computeAndSaveSnapshot (DB wrapper)
- `packages/core-finance/src/__tests__/snapshot.test.ts` — 6 unit tests for snapshot computation
- `packages/core-finance/src/index.ts` — added `export * from './snapshot'`
- `apps/web/app/(app)/dashboard/page.tsx` — RSC dashboard with 4 data fetches and layout sections
- `apps/web/components/finance/patrimony-summary.tsx` — net worth card with refresh action
- `apps/web/components/finance/account-summary-row.tsx` — grid of per-account mini cards
- `apps/web/components/finance/quick-stats-row.tsx` — income / expenses / net month stats
- `apps/web/__tests__/finance/dashboard.test.tsx` — RTL tests for dashboard sub-components
- `apps/web/lib/finance/queries.ts` — added getLatestSnapshot and getRecentTransactions
- `apps/web/lib/finance/actions.ts` — added refreshSnapshot server action

## Decisions Made

- **Pure computation pattern:** `computeSnapshot` takes `Account[]` with no DB dependency so it is fully unit-testable. `computeAndSaveSnapshot` is the thin DB wrapper. Established as pattern for future domain computations (e.g., investment allocation, projection engine).
- **Submodule imports for client components:** Client components that import from `@floow/core-finance` must use direct submodule paths (`@floow/core-finance/snapshot`) not the barrel `@floow/core-finance` index, because ofx-js (a transitive dep) is Node-only and webpack will fail to bundle it for the browser. This is the correct pattern for all future packages with Node-only transitive dependencies.
- **db.transaction() for atomicity:** Multi-step financial mutations (transfer balance updates, bulk import inserts + balance delta) are now wrapped in `db.transaction()`. The earlier pattern of two separate SQL calls was acceptable for MVP but replaced during human verification feedback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrapped financial mutations in db.transaction() for atomicity**
- **Found during:** Human verification review (Task 3)
- **Issue:** Transfer balance updates (debit source + credit destination) and import balance updates were two separate SQL calls with no transaction — a crash between them would leave balances in an inconsistent state
- **Fix:** Wrapped both operations in `db.transaction()` using Drizzle's transaction API
- **Files modified:** `apps/web/lib/finance/actions.ts`
- **Verification:** Manual verification during human testing session
- **Committed in:** `9b3613d`

**2. [Rule 2 - Missing Critical] Added fail-fast env var validation at startup**
- **Found during:** Human verification review (Task 3)
- **Issue:** Missing required environment variables (DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, etc.) caused silent failures or cryptic runtime errors deep in the call stack
- **Fix:** Added startup validation that throws immediately with a descriptive error listing the missing variables
- **Files modified:** `apps/web/lib/env.ts` (or equivalent entry point)
- **Verification:** Build and dev server confirmed to fail fast with clear error when vars missing
- **Committed in:** `0bcdf78`

**3. [Rule 3 - Blocking] Changed client component imports from barrel to submodule**
- **Found during:** Task 2 (dashboard build)
- **Issue:** Importing `@floow/core-finance` barrel in client components caused webpack to try bundling `ofx-js` (Node-only), failing the browser build
- **Fix:** Changed all client-side imports to direct submodule paths (e.g., `@floow/core-finance/snapshot`, `@floow/core-finance/balance`)
- **Files modified:** `apps/web/components/finance/patrimony-summary.tsx`, `apps/web/app/(app)/dashboard/page.tsx`
- **Verification:** Build passes, no webpack bundling errors
- **Committed in:** `65cfec2` (part of task commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** All three were necessary for correctness, security, or build success. No scope creep.

## Issues Encountered

- ofx-js barrel import conflict: the `packages/core-finance` index re-exports everything including OFX parser which uses Node built-ins (`fs`, `stream`). Webpack cannot bundle these for the browser. Resolution: direct submodule imports in all client-facing code. This pattern must be applied to any future package that has Node-only transitive dependencies.

## User Setup Required

None — no new external service configuration required. All infrastructure established in prior plans.

## Next Phase Readiness

- Complete Finance Engine end-to-end verified by user: login, account creation, transaction registration, transfer, balance verification, dashboard, patrimony snapshot refresh.
- Phase 2 (Finance Engine) is fully complete: data layer (02-01), UI CRUD (02-02), OFX/CSV import + cash flow (02-03), dashboard + patrimony (02-04).
- Phase 3 (Investments) can begin. The `computeSnapshot` pure-function pattern and `db.transaction()` pattern are established for re-use in investment allocation and projection computations.
- No blockers.

---
*Phase: 02-finance-engine*
*Completed: 2026-03-10*
