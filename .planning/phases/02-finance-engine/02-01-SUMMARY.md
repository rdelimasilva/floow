---
phase: 02-finance-engine
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, supabase, vitest, zod, finance, monorepo]

# Dependency graph
requires:
  - phase: 01-platform-foundation
    provides: orgs table (FK parent), get_user_org_ids() RLS helper, auth schema pattern, Drizzle client pattern

provides:
  - Drizzle finance schema: accounts, transactions, categories, patrimonySnapshots tables + 2 enums
  - Inferred TypeScript types for all 4 tables (Account, NewAccount, Transaction, NewTransaction, Category, NewCategory, PatrimonySnapshot, NewPatrimonySnapshot)
  - SQL migration 00002_finance.sql with RLS policies + 11 system categories seeded
  - UNIQUE index uq_transactions_external_account(external_id, account_id) for import deduplication
  - @floow/db client.ts updated to include financeSchema in fullSchema
  - @floow/shared Zod schemas: createAccountSchema, createTransactionSchema + inferred input types
  - @floow/core-finance package bootstrapped with vitest, balance utilities (centsToCurrency, currencyToCents, formatBRL), and shared types

affects:
  - 02-02: dashboard data layer (uses accounts, transactions, patrimonySnapshots tables)
  - 02-03: CSV/OFX import (depends on uq_transactions_external_account UNIQUE index for ON CONFLICT DO NOTHING)
  - 02-04: patrimony snapshots (depends on patrimonySnapshots table and core-finance types)
  - All subsequent Phase 2 plans

# Tech tracking
tech-stack:
  added:
    - vitest ^3.0.0 in @floow/core-finance (test infrastructure)
    - drizzle-orm ^0.40.0 in @floow/core-finance (for type imports)
    - @floow/db workspace:* in @floow/core-finance (cross-package DB types)
  patterns:
    - Drizzle pgTable with index() and uniqueIndex() in third argument (matches auth.ts pattern)
    - Monetary amounts stored as integer cents (balanceCents, amountCents, netWorthCents, etc.)
    - SQL migration maintained separately from Drizzle schema (Drizzle for TS types, SQL for RLS/functions/seed)
    - Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) for Brazilian currency formatting
    - System categories seeded with org_id = NULL, is_system = true (visible to all authenticated users via RLS)

key-files:
  created:
    - packages/db/src/schema/finance.ts
    - packages/db/src/__tests__/finance-schema.test.ts
    - packages/shared/src/schemas/finance.ts
    - supabase/migrations/00002_finance.sql
    - packages/core-finance/src/balance.ts
    - packages/core-finance/src/types.ts
    - packages/core-finance/src/__tests__/balance.test.ts
    - packages/core-finance/vitest.config.ts
  modified:
    - packages/db/src/index.ts
    - packages/db/src/client.ts
    - packages/shared/src/index.ts
    - packages/core-finance/src/index.ts
    - packages/core-finance/package.json
    - packages/core-finance/tsconfig.json

key-decisions:
  - "Integer cents for all monetary values — avoids floating-point errors in financial calculations"
  - "uniqueIndex('uq_transactions_external_account').on(externalId, accountId) — REQUIRED for Plan 02-03 ON CONFLICT DO NOTHING import deduplication; PostgreSQL treats NULLs as distinct so only non-null externalId rows are constrained"
  - "categories.orgId is nullable — NULL means system-wide default visible to all authenticated users via extra RLS SELECT policy"
  - "breakdown column stored as text (not jsonb) — simpler migration, parsed in application layer"
  - "core-finance tsconfig: removed rootDir constraint to allow @floow/db cross-package imports via path aliases"

patterns-established:
  - "Pattern 1: All RLS policies use org_id IN (SELECT public.get_user_org_ids()) — consistent with 00001_foundation.sql"
  - "Pattern 2: System data (categories) uses org_id IS NULL with separate RLS SELECT policy permitting public reads"
  - "Pattern 3: Balance utilities in core-finance are pure functions with no DB dependency — safe for use in any package"
  - "Pattern 4: TDD for all schema and utility code — RED (failing test) before GREEN (implementation)"

requirements-completed: [FIN-01, FIN-02, FIN-03]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 2 Plan 01: Finance Data Layer Summary

**Drizzle schema for 4 finance tables with RLS migration, UNIQUE dedup index for import, 11 seeded system categories, and core-finance balance utilities (centsToCurrency/currencyToCents/formatBRL) via vitest-tested TDD**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-11T00:42:00Z
- **Completed:** 2026-03-11T00:46:00Z
- **Tasks:** 2 completed
- **Files modified:** 14

## Accomplishments

- Finance Drizzle schema with 4 tables (accounts, transactions, categories, patrimonySnapshots), 2 enums (accountTypeEnum, transactionTypeEnum), and 8 inferred TypeScript types fully exported from @floow/db
- SQL migration 00002_finance.sql with RLS policies matching Phase 1 pattern, UNIQUE index for import deduplication, and 11 system categories seeded (Salario, Freelance, Investimentos, Aluguel, Alimentacao, Transporte, Saude, Educacao, Lazer, Assinaturas, Outros)
- @floow/core-finance package bootstrapped with vitest, balance utilities, and NormalizedTransaction/CashFlowMonth types; all 7 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Drizzle finance schema, Zod validation schemas, and schema tests** - `ecaa99d` (feat)
2. **Task 2: SQL migration, core-finance bootstrap with balance utilities** - `f8788d3` (feat)

**Plan metadata:** (docs commit below)

_Note: Both tasks followed TDD — RED (failing test) before GREEN (implementation)_

## Files Created/Modified

- `packages/db/src/schema/finance.ts` — accounts, categories, transactions, patrimonySnapshots tables + enums + inferred types
- `packages/db/src/__tests__/finance-schema.test.ts` — 11 schema tests verifying all columns and enums (TDD)
- `packages/db/src/index.ts` — added `export * from './schema/finance'`
- `packages/db/src/client.ts` — added financeSchema import and spread into fullSchema
- `packages/shared/src/schemas/finance.ts` — createAccountSchema + createTransactionSchema Zod schemas
- `packages/shared/src/index.ts` — added `export * from './schemas/finance'`
- `supabase/migrations/00002_finance.sql` — SQL tables, indexes, UNIQUE dedup index, RLS policies, system category seed
- `packages/core-finance/package.json` — added vitest, drizzle-orm, @floow/db deps + test script
- `packages/core-finance/vitest.config.ts` — vitest config matching db package pattern
- `packages/core-finance/src/balance.ts` — centsToCurrency, currencyToCents, formatBRL helpers
- `packages/core-finance/src/types.ts` — NormalizedTransaction, CashFlowMonth interfaces + DB type re-exports
- `packages/core-finance/src/__tests__/balance.test.ts` — 7 balance utility tests (TDD)
- `packages/core-finance/src/index.ts` — exports balance and types modules
- `packages/core-finance/tsconfig.json` — removed rootDir constraint for cross-package imports

## Decisions Made

- Integer cents for all monetary values to avoid floating-point errors in financial calculations
- `uniqueIndex('uq_transactions_external_account').on(externalId, accountId)` — PostgreSQL treats NULLs as distinct in unique indexes, so only non-null externalId rows are constrained; this enables `ON CONFLICT DO NOTHING` deduplication in Plan 02-03
- `categories.orgId` is nullable — NULL signals system-wide defaults; RLS SELECT policy includes `OR org_id IS NULL` for system category visibility
- `breakdown` stored as `text` (not `jsonb`) — simpler migration, parsed in application layer
- Removed `rootDir` from core-finance tsconfig to allow @floow/db cross-package type imports via path aliases

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed core-finance tsconfig rootDir preventing cross-package imports**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `tsconfig.json` had `"rootDir": "./src"` which caused TS6059 errors when importing `@floow/db` since those files resolve outside `packages/core-finance/src`
- **Fix:** Removed `rootDir` from core-finance/tsconfig.json — `outDir` is sufficient; root-level tsconfig handles path resolution
- **Files modified:** `packages/core-finance/tsconfig.json`
- **Verification:** `pnpm turbo run typecheck` passes across all 5 packages
- **Committed in:** `f8788d3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in tsconfig)
**Impact on plan:** Necessary for cross-package type imports to work. No scope creep.

## Issues Encountered

None beyond the tsconfig deviation documented above.

## User Setup Required

None — no external service configuration required. The SQL migration `00002_finance.sql` will be applied to Supabase when running `supabase db push` or via the Supabase dashboard migration tool.

## Next Phase Readiness

- Finance schema fully defined and exported from @floow/db — all subsequent Phase 2 plans can import Account, Transaction, Category, PatrimonySnapshot types
- SQL migration ready for Supabase deployment
- core-finance package has vitest infrastructure ready for Plan 02-02 balance/analytics functions
- UNIQUE index `uq_transactions_external_account` in place — Plan 02-03 import deduplication can use `ON CONFLICT DO NOTHING`
- No blockers for Phase 2 continuation

---
*Phase: 02-finance-engine*
*Completed: 2026-03-11*

## Self-Check: PASSED

- All 12 created/modified files exist on disk
- Commits ecaa99d (Task 1) and f8788d3 (Task 2) verified in git log
- pnpm --filter @floow/db test: 16 passed (11 finance schema + 5 existing)
- pnpm --filter @floow/core-finance test: 7 passed
- pnpm turbo run typecheck: 5 successful, 0 failed
