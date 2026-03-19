---
phase: 05-automation-foundation
plan: 01
subsystem: database
tags: [sql, typescript, date-fns, vitest, tdd, category-rules, recurring-transactions, rls, pg_trgm]

# Dependency graph
requires:
  - phase: 02-finance
    provides: transactions table being ALTERed, categories and orgs FK targets
  - phase: 04-planning
    provides: migration pattern (RLS via get_user_org_ids, policy naming convention)

provides:
  - SQL migration 00006_automation.sql with category_rules and recurring_templates tables
  - ALTER TABLE transactions adding recurring_template_id FK column
  - Partial unique index (recurring_template_id, date) for dedup guard
  - GIN index on category_rules.match_value for ILIKE queries
  - matchCategory pure function with exact/contains case-insensitive matching
  - advanceByFrequency pure function for all 6 frequencies with date-fns month-end clamping
  - getOverdueDates pure function returning due dates up to reference date
  - 28 new tests covering all behavior including edge cases

affects: [06-categorization, 07-recurring, future-server-actions]

# Tech tracking
tech-stack:
  added: [date-fns@^4.1.0, pg_trgm extension]
  patterns: [TDD red-green, pure function design, local date constructor for timezone safety]

key-files:
  created:
    - supabase/migrations/00006_automation.sql
    - packages/core-finance/src/categorization.ts
    - packages/core-finance/src/recurring.ts
    - packages/core-finance/src/__tests__/categorization.test.ts
    - packages/core-finance/src/__tests__/recurring.test.ts
  modified:
    - packages/core-finance/package.json (added date-fns@^4.1.0)
    - packages/core-finance/src/index.ts (added Phase 5 barrel exports)

key-decisions:
  - "Use new Date(YYYY, M, D) local constructor in tests, not new Date('YYYY-MM-DD') ISO string, to avoid UTC-3 timezone drift with date-fns v4 local-time operations"
  - "matchCategory does not check isEnabled — caller is responsible for pre-filtering disabled rules"
  - "Rules are passed pre-sorted by priority DESC — function returns first match"
  - "getOverdueDates uses <= comparison (referenceDate is inclusive)"

patterns-established:
  - "Date tests: Use new Date(Y, M, D) (local constructor) + toLocaleDateString('en-CA') for assertions, not ISO string constructor + toISOString"
  - "Pure functions: no Date.now() or new Date() inside — all dates injected as parameters"
  - "Barrel exports: append '// Phase N -- section name' comment block to index.ts"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 5 Plan 01: Automation Foundation Summary

**SQL migration with category_rules and recurring_templates tables, RLS, GIN/trgm indexes, and tested pure TypeScript functions for matchCategory, advanceByFrequency, and getOverdueDates using date-fns v4**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T01:10:46Z
- **Completed:** 2026-03-19T01:15:10Z
- **Tasks:** 2 (+ 1 TDD RED commit)
- **Files modified:** 7

## Accomplishments

- Created `00006_automation.sql` with 2 new tables, 1 ALTER, 5 indexes (including GIN+trgm), and 8 RLS policies matching the established 00005 pattern
- Implemented `matchCategory` pure function: exact and contains case-insensitive matching, first-match wins from pre-sorted priority DESC rules array
- Implemented `advanceByFrequency` + `getOverdueDates` using date-fns v4 with correct month-end clamping (Jan 31 -> Feb 28 -> Mar 28 chain)
- 134 total tests passing (106 pre-existing + 28 new: 11 categorization + 17 recurring)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration and date-fns dependency** - `fdaa51c` (feat)
2. **Task 2 RED: Failing test files** - `a4b905f` (test)
3. **Task 2 GREEN: Implementation + barrel wiring** - `98b3e74` (feat)

**Plan metadata:** *(pending final metadata commit)*

_Note: TDD task has two commits — RED (failing tests) and GREEN (implementation + fixed tests)_

## Files Created/Modified

- `supabase/migrations/00006_automation.sql` - Schema migration: category_rules, recurring_templates, ALTER transactions, 5 indexes, 8 RLS policies
- `packages/core-finance/src/categorization.ts` - matchCategory pure function with CategoryRule interface and MatchType union
- `packages/core-finance/src/recurring.ts` - advanceByFrequency and getOverdueDates pure functions using date-fns v4
- `packages/core-finance/src/__tests__/categorization.test.ts` - 11 test cases for matchCategory
- `packages/core-finance/src/__tests__/recurring.test.ts` - 17 test cases for advanceByFrequency and getOverdueDates
- `packages/core-finance/package.json` - Added date-fns@^4.1.0 dependency
- `packages/core-finance/src/index.ts` - Added Phase 5 barrel exports for categorization and recurring

## Decisions Made

- Used `new Date(YYYY, M, D)` (local constructor) in tests instead of ISO string to avoid UTC-3 timezone drift with date-fns v4's local-time operations
- `matchCategory` does not filter by `isEnabled` — callers must pre-filter; function documents this as a precondition
- `getOverdueDates` uses `<=` comparison making `referenceDate` inclusive (consistent with "generate everything up to and including today")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed recurring tests: ISO date constructor causes timezone drift in UTC-3**
- **Found during:** Task 2 GREEN phase (tests failing after implementation)
- **Issue:** Plan specified `new Date('YYYY-MM-DD')` which creates UTC midnight. In UTC-3, `new Date('2026-01-31')` resolves to local Jan 30 at 21:00. date-fns v4 advances from local Jan 30, producing wrong results (Feb 28 clamped to Mar 1 UTC)
- **Fix:** Changed all test date constructors to `new Date(YYYY, M, D)` (local midnight) and assertions to `.toLocaleDateString('en-CA')` returning 'YYYY-MM-DD' in local time
- **Files modified:** `packages/core-finance/src/__tests__/recurring.test.ts`
- **Verification:** All 17 recurring tests pass including month-end clamp chain and leap year cases
- **Committed in:** `98b3e74` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - timezone bug in test assertions)
**Impact on plan:** Fix necessary for correctness. Tests would fail on any UTC-3 machine. No scope creep.

## Issues Encountered

- Pre-existing TypeScript error in `packages/core-finance/src/import/ofx.ts` (line 55): `TS2345 string | number not assignable to string`. Not caused by Plan 05-01 changes. Logged to `deferred-items.md`.

## User Setup Required

None - no external service configuration required. Migration will be applied when Supabase migrations run in a future step.

## Next Phase Readiness

- Phase 6 (Categorization UI + server actions): `category_rules` table ready, `matchCategory` function exported and tested
- Phase 7 (Recurring transactions): `recurring_templates` table ready, `advanceByFrequency`/`getOverdueDates` exported and tested
- Both tables have RLS, indexes, and FK constraints in place

---
*Phase: 05-automation-foundation*
*Completed: 2026-03-18*
