---
phase: 02-finance-engine
plan: 02
subsystem: ui
tags: [nextjs, react-hook-form, zod, drizzle, shadcn, server-actions, atomic-sql, tdd, vitest]

# Dependency graph
requires:
  - phase: 02-01
    provides: Drizzle finance schema (accounts, transactions, categories), Zod createAccountSchema/createTransactionSchema, core-finance formatBRL/currencyToCents utilities

provides:
  - Server action createAccount (insert into accounts, revalidatePath /accounts)
  - Server action createTransaction (income/expense = 1 row; transfer = 2 linked rows with transferGroupId, atomic sql`balance_cents + delta` balance updates)
  - Query helpers getAccounts, getTransactions (with category join), getCategories, getOrgId
  - RSC pages: /accounts (account grid + total balance), /accounts/new (form), /transactions (paginated list), /transactions/new (full form)
  - Components: AccountCard, TransactionList, TransactionForm
  - Navigation: Dashboard > Contas > Transacoes > Plano
  - 6 unit tests: transfer two-row behavior, transferGroupId linkage, signed amounts

affects:
  - 02-03: import transactions (uses createTransaction server action pattern, queries.ts helpers)
  - 02-04: patrimony snapshots (uses getAccounts and account balance data)
  - All dashboard/reporting features (transaction data now available)

# Tech tracking
tech-stack:
  added:
    - "@floow/core-finance": workspace:* in @floow/web (formatBRL, currencyToCents)
    - "@radix-ui/react-select": ^2.2.6 (shadcn Select)
    - shadcn Select component (components/ui/select.tsx)
  patterns:
    - Server actions use 'use server' directive, accept FormData, call getOrgId() then createDb(DATABASE_URL)
    - Atomic balance updates via sql`balance_cents + ${delta}` — never read-modify-write
    - Transfer transactions: two rows with same transferGroupId, source negative, destination positive
    - RSC pages call getOrgId() + query helpers, pass data to client components
    - getOrgId() extracts orgId from user.app_metadata.org_ids[0] (JWT claim set by auth trigger)
    - TransactionForm uses Controller for shadcn Select + react-hook-form integration

key-files:
  created:
    - apps/web/lib/finance/actions.ts
    - apps/web/lib/finance/queries.ts
    - apps/web/__tests__/finance/actions.test.ts
    - apps/web/app/(app)/accounts/page.tsx
    - apps/web/app/(app)/accounts/new/page.tsx
    - apps/web/app/(app)/transactions/page.tsx
    - apps/web/app/(app)/transactions/new/page.tsx
    - apps/web/components/finance/account-card.tsx
    - apps/web/components/finance/transaction-form.tsx
    - apps/web/components/finance/transaction-list.tsx
    - apps/web/components/ui/select.tsx
    - packages/core-finance/ofx-js.d.ts
  modified:
    - apps/web/app/(app)/layout.tsx
    - apps/web/package.json
    - packages/core-finance/src/import/ofx.ts
    - packages/core-finance/tsconfig.json
    - pnpm-lock.yaml

key-decisions:
  - "Server actions call getOrgId() which reads org from JWT app_metadata.org_ids[0] — no DB lookup, stateless, matches auth trigger pattern from Phase 1"
  - "Transfer transactions atomically update BOTH account balances in separate sql`` calls — not a DB transaction but each update is atomic; acceptable for MVP given no concurrent transfer edge cases yet"
  - "TransactionForm uses Controller wrapper for shadcn Select — react-hook-form register() doesn't work directly with Radix Select (uncontrolled vs controlled)"
  - "ofx-js type declaration added via ambient .d.ts at packages/core-finance root — ts-ignore used in ofx.ts since web tsconfig resolves core-finance source directly"

patterns-established:
  - "Pattern 1: Server actions accept FormData (compatible with HTML forms and programmatic calls), validate with Zod, call createDb(DATABASE_URL) per action"
  - "Pattern 2: Atomic balance increment via sql`balance_cents + ${signedAmount}` — never read current balance and add (race condition risk)"
  - "Pattern 3: TDD for server action side effects — mock @floow/db createDb, assert on insert/update call arguments"
  - "Pattern 4: RSC pages for data fetching, client components for interactivity — AccountCard/TransactionList are client, pages are server"

requirements-completed: [FIN-01, FIN-02, FIN-03]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 2 Plan 02: Finance UI and Server Actions Summary

**Account management and transaction registration UI with atomic SQL balance updates: server actions createAccount/createTransaction, RSC pages for /accounts and /transactions, AccountCard/TransactionList/TransactionForm components, 6 TDD unit tests verifying transfer two-row behavior and transferGroupId linkage**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-11T00:49:41Z
- **Completed:** 2026-03-11T00:57:30Z
- **Tasks:** 2 completed
- **Files modified:** 16

## Accomplishments

- Server actions `createAccount` and `createTransaction` with Zod validation, orgId extraction from JWT, and atomic `sql`balance_cents + ${delta}`` balance updates for income, expense, and transfer types
- Transfer transactions insert exactly two linked rows with same `transferGroupId` (UUID), source account debited (negative amountCents), destination account credited (positive amountCents) — verified by 6 unit tests
- Complete finance UI: accounts page (grid with AccountCard showing type icon and formatted BRL balance), account creation form, transaction list (table with category badge and color-coded amounts), transaction creation form (type toggle, category filter, transfer destination select)
- Navigation updated: Dashboard > Contas > Transacoes > Plano order

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD RED): Failing tests for createTransaction transfer behavior** - `9fe6e4a` (test)
2. **Task 1 (TDD GREEN): Server actions createAccount/createTransaction + query helpers** - `e93d5b6` (feat)
3. **Task 2: Account and transaction UI pages with finance navigation** - `ffddab9` (feat)

_Note: Task 1 followed TDD — RED (failing test committed at 9fe6e4a) before GREEN (implementation at e93d5b6)_

## Files Created/Modified

- `apps/web/lib/finance/actions.ts` — createAccount (validate, insert, revalidate) and createTransaction (income/expense/transfer with atomic balance updates)
- `apps/web/lib/finance/queries.ts` — getOrgId, getAccounts, getTransactions (with category join), getCategories
- `apps/web/__tests__/finance/actions.test.ts` — 6 tests: transfer 2-row, transferGroupId, signed amounts, balance update SQL expressions; income/expense 1-row with correct sign
- `apps/web/app/(app)/accounts/page.tsx` — RSC: account grid, total balance, empty state, New Account CTA
- `apps/web/app/(app)/accounts/new/page.tsx` — Client: react-hook-form, name/type fields with Select
- `apps/web/app/(app)/transactions/page.tsx` — RSC: TransactionList, New Transaction + Import buttons
- `apps/web/app/(app)/transactions/new/page.tsx` — RSC: loads accounts+categories, renders TransactionForm
- `apps/web/components/finance/account-card.tsx` — type icon map, formatBRL, red/green balance
- `apps/web/components/finance/transaction-form.tsx` — type toggle (income/expense/transfer), category filter, Controller for Select, currencyToCents conversion
- `apps/web/components/finance/transaction-list.tsx` — table layout, category badge with color, formatted amounts
- `apps/web/components/ui/select.tsx` — shadcn Select (installed via pnpm dlx shadcn@latest add select)
- `apps/web/app/(app)/layout.tsx` — Contas and Transacoes nav links added
- `apps/web/package.json` — @floow/core-finance workspace:* added
- `packages/core-finance/ofx-js.d.ts` — ambient module declaration for ofx-js
- `packages/core-finance/src/import/ofx.ts` — ts-ignore comment for ofx-js import
- `packages/core-finance/tsconfig.json` — include *.d.ts files

## Decisions Made

- `getOrgId()` reads `user.app_metadata.org_ids[0]` from Supabase JWT — no extra DB lookup needed; orgId set by the `on_auth_user_created` trigger from Phase 1
- Transfer balance updates made as two separate atomic SQL calls (not a DB transaction) — acceptable for MVP; true DB transaction would require Drizzle `.transaction()` and connection sharing which adds complexity
- `TransactionForm` uses `Controller` from react-hook-form for shadcn Select components — Radix Select is a controlled component that doesn't expose a native input, so `register()` doesn't work directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test UUIDs failing Zod validation**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Tests used `'acct-source-uuid'` and `'acct-dest-uuid'` as FormData values, but `createTransactionSchema` uses `z.string().uuid()` — Zod rejected them
- **Fix:** Added UUID constants (`TEST_SOURCE_ACCOUNT_ID`, `TEST_DEST_ACCOUNT_ID`, `TEST_CATEGORY_ID`) with valid UUID format; replaced all string literals in test file
- **Files modified:** `apps/web/__tests__/finance/actions.test.ts`
- **Verification:** All 6 tests pass after fix
- **Committed in:** `e93d5b6` (Task 1 GREEN commit, tests amended in same commit)

**2. [Rule 3 - Blocking] Added @floow/core-finance as web app dependency**
- **Found during:** Task 2 (building AccountCard component)
- **Issue:** `@floow/core-finance` was not listed in `apps/web/package.json` dependencies — import would fail at runtime
- **Fix:** Added `"@floow/core-finance": "workspace:*"` to dependencies, ran `pnpm install`
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verification:** Build compiles, formatBRL and currencyToCents importable in web components
- **Committed in:** `ffddab9` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed ofx-js missing type declarations blocking typecheck**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `packages/core-finance/src/import/ofx.ts` imported from `ofx-js` which has no TypeScript declarations; web tsconfig resolves core-finance source directly so web's `tsc --noEmit` sees the error
- **Fix:** Added `// @ts-ignore` with explanatory comment above the import; also added ambient `ofx-js.d.ts` declaration file (for core-finance's own typecheck)
- **Files modified:** `packages/core-finance/src/import/ofx.ts`, `packages/core-finance/ofx-js.d.ts`, `packages/core-finance/tsconfig.json`
- **Verification:** `pnpm turbo run typecheck --filter=@floow/web` passes
- **Committed in:** `ffddab9` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 test bug, 1 Rule 3 blocking dependency, 1 Rule 1 type declaration)
**Impact on plan:** All auto-fixes necessary for tests to run and build to succeed. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — all finance UI components and server actions work with existing Supabase credentials. No new external services or environment variables required.

## Next Phase Readiness

- `createTransaction` server action ready for Plan 02-03 CSV/OFX import (same action pattern, bulk calls)
- `getAccounts` and `getTransactions` query helpers ready for Plan 02-04 patrimony snapshots
- Navigation includes /transactions/import link (pointing to route built in Plan 02-03)
- UNIQUE index `uq_transactions_external_account` from Plan 02-01 is in place for import deduplication
- No blockers for Phase 2 continuation

---
*Phase: 02-finance-engine*
*Completed: 2026-03-11*

## Self-Check: PASSED

Files verified:
- apps/web/lib/finance/actions.ts: EXISTS
- apps/web/lib/finance/queries.ts: EXISTS
- apps/web/__tests__/finance/actions.test.ts: EXISTS
- apps/web/app/(app)/accounts/page.tsx: EXISTS
- apps/web/app/(app)/accounts/new/page.tsx: EXISTS
- apps/web/app/(app)/transactions/page.tsx: EXISTS
- apps/web/app/(app)/transactions/new/page.tsx: EXISTS
- apps/web/components/finance/account-card.tsx: EXISTS
- apps/web/components/finance/transaction-form.tsx: EXISTS
- apps/web/components/finance/transaction-list.tsx: EXISTS

Commits verified:
- 9fe6e4a (test RED) — in git log
- e93d5b6 (feat GREEN Task 1) — in git log
- ffddab9 (feat Task 2) — in git log

Tests: 6 passed (pnpm --filter @floow/web test -- actions)
Typecheck: PASSED (pnpm turbo run typecheck --filter=@floow/web)
Build: PASSED (pnpm turbo run build --filter=@floow/web) — 14 routes compiled
