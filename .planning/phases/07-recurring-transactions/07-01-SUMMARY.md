---
phase: 07-recurring-transactions
plan: 01
subsystem: database
tags: [drizzle, recurring, server-actions, postgres, typescript]

# Dependency graph
requires:
  - phase: 05-automation-foundation
    provides: advanceByFrequency, getOverdueDates pure functions and recurring_templates SQL migration
  - phase: 06-categorization-rules
    provides: getCategoryRules, matchCategory for auto-categorization in generateRecurringTransaction
provides:
  - recurringTemplates Drizzle table with nextDueDate index and RecurringTemplateRow type aliases
  - getRecurringTemplates, getUpcomingRecurring queries
  - createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, toggleRecurringActive, generateRecurringTransaction server actions
affects:
  - 07-02 (UI consumes all 7 query/action exports from this plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server actions split across files to respect 500-line CLAUDE.md limit"
    - "generateRecurringTransaction stores signed amountCents (negative for expenses) matching existing transaction pattern"
    - "onConflictDoNothing dedup relies on unique index uq_generated_transactions (recurring_template_id, date)"

key-files:
  created:
    - apps/web/lib/finance/recurring-actions.ts
  modified:
    - packages/db/src/schema/automation.ts
    - apps/web/lib/finance/queries.ts
    - apps/web/lib/finance/actions.ts

key-decisions:
  - "recurring-actions.ts created as separate file — CLAUDE.md 500-line limit blocks adding to actions.ts (1420 lines)"
  - "generateRecurringTransaction stores signed amountCents (income positive, expense negative) to match createTransaction pattern"
  - "assertAccountOwnership exported from actions.ts (not inlined) to keep DRY"
  - "getUpcomingRecurring uses plain JS Date arithmetic (Date.now() + 30*86400000) — date-fns not a web app dependency"

patterns-established:
  - "Recurring action dedup: onConflictDoNothing().returning() — check result.length before balance update"
  - "Auto-categorize before db.transaction() — getCategoryRules() must not be called inside transaction"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-05]

# Metrics
duration: 8min
completed: 2026-03-29
---

# Phase 07 Plan 01: Recurring Transactions Schema Summary

**Drizzle schema, 2 queries, and 5 server actions for recurring template CRUD and atomic on-demand transaction generation with dedup and balance updates**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T10:08:00Z
- **Completed:** 2026-03-29T10:16:13Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `idxRecurringTemplatesNextDueDate` index and `RecurringTemplateRow`/`NewRecurringTemplateRow` type aliases to automation.ts (schema was already mostly implemented)
- Added `getRecurringTemplates()` and `getUpcomingRecurring()` to queries.ts
- Created `recurring-actions.ts` with all 5 server actions in 312 lines

## Task Commits

1. **Task 1: Drizzle schema nextDueDate index + type aliases** - `47611a8` (feat)
2. **Task 2: Recurring queries + CRUD + generate server actions** - `93c73bf` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/db/src/schema/automation.ts` - Added nextDueDate index and RecurringTemplateRow/NewRecurringTemplateRow type aliases
- `apps/web/lib/finance/queries.ts` - Added getRecurringTemplates, getUpcomingRecurring + recurringTemplates import
- `apps/web/lib/finance/actions.ts` - Exported assertAccountOwnership for reuse
- `apps/web/lib/finance/recurring-actions.ts` - New file: 5 server actions (createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, toggleRecurringActive, generateRecurringTransaction)

## Decisions Made
- **Separate file for recurring actions:** CLAUDE.md 500-line limit means actions.ts (1420 lines) cannot accept new code. Created `recurring-actions.ts` as a clean split.
- **Signed amountCents in generateRecurringTransaction:** Plan code stored unsigned `template.amountCents` but existing codebase stores signed amounts — fixed to store `signedAmount` (negative for expenses).
- **Plain JS 30-day offset:** date-fns is not a direct dependency of apps/web, avoided adding it; used `Date.now() + 30 * 86400000` instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created recurring-actions.ts instead of adding to actions.ts**
- **Found during:** Task 2 (server actions implementation)
- **Issue:** CLAUDE.md mandates max 500 lines per file. actions.ts is 1420 lines — adding 5 more server actions would further violate it.
- **Fix:** Created `apps/web/lib/finance/recurring-actions.ts` with its own `'use server'` directive. Exported `assertAccountOwnership` from actions.ts for the new file to import.
- **Files modified:** apps/web/lib/finance/recurring-actions.ts (new), apps/web/lib/finance/actions.ts (export added)
- **Verification:** TypeScript compiles without errors
- **Committed in:** 93c73bf (Task 2 commit)

**2. [Rule 1 - Bug] Fixed unsigned amountCents in generateRecurringTransaction**
- **Found during:** Task 2 (generateRecurringTransaction implementation)
- **Issue:** Plan code stored `template.amountCents` (unsigned) in transaction rows. Existing `createTransaction` and `createRecurringTransactions` store signed amounts (negative for expenses). Storing unsigned would cause incorrect balance math and break the running-balance display.
- **Fix:** Compute `signedAmount = template.type === 'income' ? template.amountCents : -template.amountCents` and use that for both insert and balance update.
- **Files modified:** apps/web/lib/finance/recurring-actions.ts
- **Verification:** TypeScript compiles; pattern matches createTransaction at line 234 of actions.ts
- **Committed in:** 93c73bf (Task 2 commit)

**3. [Rule 1 - Bug] Task 1 schema already existed — added only the delta**
- **Found during:** Task 1 (schema inspection)
- **Issue:** automation.ts already had the recurringTemplates table (with extra fields: endMode, installmentCount, endDate, transferDestinationAccountId) and finance.ts already had recurringTemplateId. Only missing: nextDueDate index and type aliases.
- **Fix:** Added only the missing index and type aliases instead of replacing the existing, richer schema.
- **Files modified:** packages/db/src/schema/automation.ts
- **Committed in:** 47611a8 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking/CLAUDE.md, 1 bug, 1 schema already exists)
**Impact on plan:** All auto-fixes necessary for correctness and CLAUDE.md compliance. No scope creep.

## Issues Encountered
- `frequency` field TypeScript type error on insert — resolved by casting to the union type literal
- Schema at automation.ts was already more complete than the plan assumed (includes endMode, installmentCount, transferDestinationAccountId for the richer recurring-batch flow)

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All 5 server actions and 2 queries ready for 07-02 UI consumption
- generateRecurringTransaction ready: dedup, balance update, auto-categorize, nextDueDate advancement
- `recurring-actions.ts` must be imported by UI via `'./recurring-actions'` (not `'./actions'`)
- 162 core-finance tests pass; TypeScript clean across db and web packages

## Self-Check: PASSED

- FOUND: apps/web/lib/finance/recurring-actions.ts
- FOUND: packages/db/src/schema/automation.ts
- FOUND: apps/web/lib/finance/queries.ts
- FOUND: .planning/phases/07-recurring-transactions/07-01-SUMMARY.md
- FOUND commit: 47611a8 feat(07-01): add nextDueDate index and RecurringTemplateRow type aliases
- FOUND commit: 93c73bf feat(07-01): add recurring template queries and server actions

---
*Phase: 07-recurring-transactions*
*Completed: 2026-03-29*
