---
phase: 06-categorization-rules
plan: 01
subsystem: server-actions
tags: [drizzle, server-actions, auto-categorize, import, bulk-categorize, migration]

# Dependency graph
requires:
  - phase: 05-automation-foundation
    provides: category_rules SQL table, matchCategory pure function
  - phase: 02-finance
    provides: transactions and categories FK targets

provides:
  - Drizzle table object categoryRules in packages/db/src/schema/automation.ts
  - isAutoCategorized column on transactions via migration 00007
  - getCategoryRules(orgId) query returning rules ordered by priority DESC
  - 7 server actions: createRule, updateRule, deleteRule, reorderRule, toggleEnabled, previewBulkRecategorize, bulkRecategorize
  - Auto-categorize hook in createTransaction (CAT-04)
  - Auto-categorize hooks in importTransactions and importSelectedTransactions (CAT-03)

affects: [06-02-categorization-ui, 07-recurring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Auto-categorize fetch-before-transaction: getCategoryRules called outside db.transaction to avoid connection exhaustion
    - ilike wildcard escaping: escapeLikePattern() escapes % and _ before bulk operations
    - priority gap-of-10: createRule assigns maxPriority + 10 for safe reordering

key-files:
  created:
    - packages/db/src/schema/automation.ts
    - supabase/migrations/00007_auto_categorized.sql
  modified:
    - packages/db/src/index.ts
    - packages/db/src/schema/finance.ts
    - apps/web/lib/finance/queries.ts
    - apps/web/lib/finance/actions.ts
    - apps/web/lib/finance/import-actions.ts

key-decisions:
  - "ilike (no wildcards) for exact match type in bulk operations — mirrors matchCategory() case-insensitive behavior"
  - "escapeLikePattern() escapes % and _ in matchValue before constructing ilike %...% patterns"
  - "Auto-categorize fetch-before-transaction pattern: getCategoryRules outside db.transaction to avoid connection pool exhaustion"
  - "createRule auto-assigns priority = maxPriority + 10 (gap-of-10) when no explicit priority provided"
  - "Transfer transactions excluded from auto-categorization via input.type !== 'transfer' guard"

# Metrics
duration: 3min
completed: 2026-03-19
---

# Phase 6 Plan 01: Categorization Rules Server Infrastructure Summary

**Complete server-side infrastructure for categorization rules: Drizzle schema, migration, getCategoryRules query, 7 CRUD/bulk server actions, and auto-categorize hooks wired into createTransaction and both import actions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T12:51:50Z
- **Completed:** 2026-03-19T12:55:16Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `automation.ts` Drizzle schema with `categoryRules` table, `CategoryRuleRow`, `NewCategoryRuleRow` type exports
- Added `isAutoCategorized` boolean field to `transactions` Drizzle schema and corresponding SQL migration `00007_auto_categorized.sql`
- Added `getCategoryRules(orgId)` query to queries.ts returning rules ordered by priority DESC
- Implemented 7 server actions following the existing `getOrgId()` + `getDb()` + `revalidatePath()` pattern:
  - `createRule` — inserts with auto-priority (maxPriority + 10) if not provided
  - `updateRule` — partial update with only provided fields
  - `deleteRule` — scoped to orgId
  - `reorderRule` — swaps priorities of adjacent rules in a db.transaction
  - `toggleEnabled` — flips isEnabled flag
  - `previewBulkRecategorize` — count of uncategorized matching transactions
  - `bulkRecategorize` — retroactive update with isAutoCategorized=true
- Wired auto-categorize hook into `createTransaction`: fetches enabled rules, calls `matchCategory()`, resolves categoryId before the db.transaction block
- Wired auto-categorize hooks into `importTransactions` and `importSelectedTransactions`: rules fetched once outside the transaction, applied per-row during rows construction
- 134 core-finance tests still green (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Drizzle schema + migration + getCategoryRules** - `81e6ec3` (feat)
2. **Task 2: Rule CRUD actions + auto-categorize hooks** - `280d28a` (feat)

## Files Created/Modified

- `packages/db/src/schema/automation.ts` — New: categoryRules Drizzle table, CategoryRuleRow, NewCategoryRuleRow
- `supabase/migrations/00007_auto_categorized.sql` — New: ALTER TABLE transactions ADD COLUMN is_auto_categorized
- `packages/db/src/index.ts` — Modified: added `export * from './schema/automation'`
- `packages/db/src/schema/finance.ts` — Modified: added isAutoCategorized field to transactions table
- `apps/web/lib/finance/queries.ts` — Modified: added getCategoryRules(orgId) query + categoryRules import
- `apps/web/lib/finance/actions.ts` — Modified: 7 new server actions + auto-categorize hook in createTransaction + updated imports
- `apps/web/lib/finance/import-actions.ts` — Modified: auto-categorize hooks in importTransactions + importSelectedTransactions + updated imports

## Decisions Made

- Used `ilike(transactions.description, rule.matchValue)` (no wildcards) for `exact` match type in bulk operations — mirrors `matchCategory()` which uses `.toLowerCase()` for case-insensitive comparison
- Implemented `escapeLikePattern()` helper that escapes `%` and `_` before constructing `ilike` `%...%` patterns in bulk operations (prevents wildcard injection from user-supplied matchValues)
- `getCategoryRules()` always called outside `db.transaction()` blocks — documented anti-pattern to prevent connection pool exhaustion under load
- `createRule` assigns `maxPriority + 10` when no explicit priority given, leaving 9 slots between rules for future insertions without full renumbering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both packages compiled cleanly on first attempt, all 134 tests green.

## Next Phase Readiness

- Phase 6 Plan 02 (UI): All server actions are ready and typed. UI can import from `actions.ts` using `createRule`, `updateRule`, etc. and from `queries.ts` using `getCategoryRules`.
- `CategoryRuleRow` type is exportable from `@floow/db` for UI component typing.

---
*Phase: 06-categorization-rules*
*Completed: 2026-03-19*

## Self-Check: PASSED

- FOUND: packages/db/src/schema/automation.ts
- FOUND: supabase/migrations/00007_auto_categorized.sql
- FOUND: .planning/phases/06-categorization-rules/06-01-SUMMARY.md
- FOUND: commit 81e6ec3 (feat(06-01): Drizzle schema + migration + getCategoryRules)
- FOUND: commit 280d28a (feat(06-01): rule CRUD actions + auto-categorize hooks)
