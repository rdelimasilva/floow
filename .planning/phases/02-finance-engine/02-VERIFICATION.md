---
phase: 02-finance-engine
verified: 2026-03-10T23:30:00Z
status: gaps_found
score: 6/7 must-haves verified
gaps:
  - truth: "Transfer transactions create two linked rows (debit + credit) atomically — verified by automated unit tests"
    status: failed
    reason: "The actions.test.ts mock does not include db.transaction — all 6 finance action tests fail with 'db.transaction is not a function'. The implementation was correctly updated to use db.transaction() in commit 9b3613d, but the test mock was never updated to include that method."
    artifacts:
      - path: "apps/web/__tests__/finance/actions.test.ts"
        issue: "setupDbMock() returns { insert: mockInsert, update: mockUpdate } — missing transaction: vi.fn() property. Implementation calls db.transaction(async (tx) => {...}) at line 101 and 162 of actions.ts."
    missing:
      - "Add transaction mock to setupDbMock() in actions.test.ts — e.g.: db.transaction = vi.fn().mockImplementation(async (fn) => fn(db)) — then verify insert/update calls inside the tx callback"
human_verification:
  - test: "Account creation and management"
    expected: "User can create accounts and see them listed with correct balances"
    why_human: "Visual layout, form interaction, and balance display require browser rendering"
  - test: "Transaction registration with transfers"
    expected: "Transfer of R$1.000 from Nubank to Poupanca shows both accounts updated"
    why_human: "Balance atomicity in production DB requires live environment to verify"
  - test: "OFX/CSV import preview and deduplication"
    expected: "Uploading the same file twice shows '0 imported, N skipped' on second upload"
    why_human: "File upload and ON CONFLICT DO NOTHING dedup requires live DB with the UNIQUE index applied"
  - test: "Dashboard cash flow chart rendering"
    expected: "Recharts BarChart renders with correct income/expense bars for each month"
    why_human: "Recharts rendering in real browser cannot be verified by jsdom tests"
---

# Phase 2: Finance Engine Verification Report

**Phase Goal:** Build the complete financial engine — accounts, transactions, import, cash flow, dashboard, and patrimony tracking
**Verified:** 2026-03-10T23:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Finance DB schema creates 4 tables with RLS, UNIQUE dedup index, 11 system categories | VERIFIED | `packages/db/src/schema/finance.ts` exports all 4 tables + enums + types; `supabase/migrations/00002_finance.sql` has RLS on all 4 tables, `CREATE UNIQUE INDEX uq_transactions_external_account`, 11 categories seeded |
| 2 | User can create accounts and see them with balances | VERIFIED | `apps/web/app/(app)/accounts/page.tsx` calls `getAccounts(orgId)`, renders `AccountCard` grid with `formatBRL`; `createAccount` server action in `actions.ts` inserts and revalidates |
| 3 | User can register income, expense, or transfer transactions with categories | VERIFIED | `createTransaction` in `actions.ts` handles all three types; `TransactionForm` component has type toggle and category select |
| 4 | Transfer creates two linked rows atomically with matching transferGroupId | FAILED | Implementation correct — `createTransaction` inserts two rows with `transferGroupId = crypto.randomUUID()` inside `db.transaction()`. But all 6 unit tests in `actions.test.ts` fail: `db.transaction is not a function` because the mock (`setupDbMock()`) only provides `{ insert, update }` and was never updated when `db.transaction()` was added in commit `9b3613d` |
| 5 | OFX/CSV import parses files and deduplicates via ON CONFLICT DO NOTHING | VERIFIED | `parseOFXFile`, `parseCSVFile` implemented; `importTransactions` uses `onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })`; 17 OFX+CSV tests pass |
| 6 | Cash flow aggregation returns monthly totals and renders as chart | VERIFIED | `aggregateCashFlow` in `cash-flow.ts` groups by YYYY-MM, 7 tests pass; `CashFlowChart` uses Recharts `BarChart` inside shadcn `ChartContainer` with `min-h-[300px]` guard |
| 7 | Dashboard shows account summary, quick stats, cash flow chart, and patrimony snapshot with refresh | VERIFIED | `dashboard/page.tsx` RSC fetches accounts+transactions+snapshot in parallel; renders `AccountSummaryRow`, `QuickStatsRow`, `CashFlowChart`, `PatrimonySummary` with `refreshSnapshot` wired; 6 RTL tests pass |

**Score:** 6/7 truths verified

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/finance.ts` | 4 tables, 2 enums, 8 inferred types | VERIFIED | All exports present: `accounts`, `transactions`, `categories`, `patrimonySnapshots`, `accountTypeEnum`, `transactionTypeEnum`, `Account/NewAccount/Transaction/NewTransaction/Category/NewCategory/PatrimonySnapshot/NewPatrimonySnapshot` |
| `supabase/migrations/00002_finance.sql` | RLS + UNIQUE index + 11 categories seeded | VERIFIED | RLS enabled on all 4 tables; `CREATE UNIQUE INDEX uq_transactions_external_account ON public.transactions (external_id, account_id) WHERE external_id IS NOT NULL`; 11 categories with `org_id = NULL, is_system = true` |
| `packages/core-finance/src/balance.ts` | centsToCurrency, currencyToCents, formatBRL | VERIFIED | All 3 functions exported and tested; 7 balance tests pass |
| `packages/shared/src/schemas/finance.ts` | createAccountSchema, createTransactionSchema | VERIFIED | Both Zod schemas and inferred types exported |

### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/finance/actions.ts` | createAccount, createTransaction | VERIFIED | Both implemented with Zod validation, orgId from JWT, atomic `sql\`balance_cents + ${delta}\``, db.transaction wrapping |
| `apps/web/lib/finance/queries.ts` | getAccounts, getTransactions, getCategories | VERIFIED | All three implemented plus getLatestSnapshot, getRecentTransactions added in 02-04 |
| `apps/web/__tests__/finance/actions.test.ts` | 6 tests for transfer behavior | STUB/BROKEN | File exists with correct test intent, but all 6 tests fail at runtime: `db.transaction is not a function` — mock was not updated when implementation switched to db.transaction() |
| `apps/web/app/(app)/accounts/page.tsx` | Account list RSC | VERIFIED | RSC calls getAccounts, renders AccountCard grid, shows total balance and empty state |
| `apps/web/app/(app)/transactions/page.tsx` | Transaction list RSC | VERIFIED | RSC calls getTransactions, renders TransactionList, has Import and New Transaction buttons |
| `apps/web/app/(app)/transactions/new/page.tsx` | Transaction creation page | VERIFIED | Loads accounts + categories, renders TransactionForm |

### Plan 02-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core-finance/src/import/ofx.ts` | parseOFXFile, parseOFXDate | VERIFIED | Both exported; uses `ofxDate.slice(0,4)/slice(4,6)/slice(6,8)` to avoid raw ISO parse; 8 tests pass |
| `packages/core-finance/src/import/csv.ts` | parseCSVFile, CsvColumnMapping | VERIFIED | Both exported; supports dd/MM/yyyy and yyyy-MM-dd; 9 tests pass |
| `packages/core-finance/src/cash-flow.ts` | aggregateCashFlow | VERIFIED | Exported; groups by YYYY-MM, sorts descending; 7 tests pass |
| `apps/web/app/(app)/transactions/import/page.tsx` | Import page RSC | VERIFIED | Loads accounts, renders ImportForm, has back link and title "Importar Transacoes" |
| `apps/web/lib/finance/import-actions.ts` | importTransactions server action | VERIFIED | Uses onConflictDoNothing, balance update from .returning() inserted rows, wrapped in db.transaction |

### Plan 02-04 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core-finance/src/snapshot.ts` | computeSnapshot pure function | VERIFIED | Pure function: no DB I/O, takes Account[], returns NewPatrimonySnapshot; separates credit_card into liabilities; 6 tests pass |
| `apps/web/app/(app)/dashboard/page.tsx` | Financial dashboard RSC | VERIFIED | Parallel fetches accounts + recentTransactions + latestSnapshot; renders all 4 sections; empty states present |
| `apps/web/components/finance/patrimony-summary.tsx` | PatrimonySummary client component | VERIFIED | Shows netWorthCents, liquidAssetsCents, liabilitiesCents, breakdown; "Atualizar Snapshot" button wired to onRefresh |
| `apps/web/__tests__/finance/dashboard.test.tsx` | RTL tests for dashboard components | VERIFIED | 6 tests pass: AccountSummaryRow (2), QuickStatsRow (1), PatrimonySummary (2), CashFlowChart (1) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/db/src/client.ts` | `packages/db/src/schema/finance.ts` | `import * as financeSchema; spread into fullSchema` | VERIFIED | Line 7: `import * as financeSchema from './schema/finance'`; line 9: `{ ...schema, ...billingSchema, ...financeSchema }` |
| `packages/db/src/index.ts` | `packages/db/src/schema/finance.ts` | barrel re-export | VERIFIED | Line 3: `export * from './schema/finance'` |
| `apps/web/lib/finance/actions.ts` | `@floow/db` | `db.insert(accounts)` | VERIFIED | Line 4: `import { createDb, accounts, transactions } from '@floow/db'`; `db.insert(accounts)` at line 44 |
| `apps/web/lib/finance/actions.ts` | `accounts.balanceCents` | `sql\`balance_cents + ${delta}\`` | VERIFIED | Line 141: `sql\`balance_cents + ${-input.amountCents}\``; line 146: `sql\`balance_cents + ${input.amountCents}\`` |
| `apps/web/app/(app)/accounts/page.tsx` | `apps/web/lib/finance/queries.ts` | RSC data fetching | VERIFIED | Line 2-3: `import { getOrgId } from '@/lib/finance/queries'; import { getAccounts } from '@/lib/finance/queries'` |
| `packages/core-finance/src/import/ofx.ts` | `ofx-js` | `import { parse } from 'ofx-js'` | VERIFIED | Line 10: `import { parse as parseOFX } from 'ofx-js'` |
| `packages/core-finance/src/import/csv.ts` | `papaparse` | `import Papa from 'papaparse'` | VERIFIED | Line 9: `import Papa from 'papaparse'` |
| `apps/web/lib/finance/import-actions.ts` | `packages/core-finance` | `import { parseOFXFile } from '@floow/core-finance'` | VERIFIED | Line 5: `import { parseOFXFile, parseCSVFile } from '@floow/core-finance'` |
| `apps/web/lib/finance/import-actions.ts` | dedup index | `onConflictDoNothing` | VERIFIED | Line 102: `.onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })` |
| `apps/web/app/(app)/dashboard/page.tsx` | `apps/web/lib/finance/queries.ts` | RSC data fetching | VERIFIED | Line 1: `import { getOrgId, getAccounts, getRecentTransactions, getLatestSnapshot } from '@/lib/finance/queries'` |
| `apps/web/app/(app)/dashboard/page.tsx` | `CashFlowChart` | `import CashFlowChart, pass aggregated data` | VERIFIED | Line 7: `import { CashFlowChart } from '@/components/finance/cash-flow-chart'`; line 83: `<CashFlowChart data={cashFlowData} />` |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| FIN-01 | 02-01, 02-02 | User can create and manage accounts (corrente, poupança, corretora) | SATISFIED | `createAccount` server action; accounts page with AccountCard grid; accountTypeEnum covers all types |
| FIN-02 | 02-01, 02-02 | User can register transactions (receita, despesa, transferência) | SATISFIED | `createTransaction` handles all 3 types with atomic balance updates; TransactionForm with type toggle |
| FIN-03 | 02-01, 02-02 | User can categorize transactions | SATISFIED | `categories` table seeded with 11 system categories; `getCategories` returns org + system categories; transaction form includes category select |
| FIN-04 | 02-03 | User can view monthly cash flow | SATISFIED | `aggregateCashFlow` in core-finance; CashFlowChart Recharts component; dashboard section "Fluxo de Caixa — Ultimos 6 Meses" |
| FIN-05 | 02-03 | User can import OFX/CSV bank statements | SATISFIED | `parseOFXFile` + `parseCSVFile` parsers; import page at `/transactions/import`; `importTransactions` server action with dedup |
| DASH-01 | 02-04 | Financial dashboard (account summary, balance, cash flow) | SATISFIED | Dashboard RSC at `/dashboard` with AccountSummaryRow, QuickStatsRow, CashFlowChart, PatrimonySummary |
| VAL-01 | 02-04 | System generates patrimony snapshots (net worth, liquid assets, liabilities, breakdown) | SATISFIED | `computeSnapshot` pure function; `computeAndSaveSnapshot` DB wrapper; `refreshSnapshot` server action; PatrimonySummary component |

**All 7 Phase 2 requirements are satisfied by actual codebase implementation.**

---

## Test Suite Results

| Package | Tests | Result |
|---------|-------|--------|
| `@floow/db` | 16 passed / 6 todo | PASS |
| `@floow/core-finance` | 37 passed | PASS |
| `@floow/web` — dashboard.test.tsx | 6 passed | PASS |
| `@floow/web` — actions.test.ts | 0 passed / 6 failed | **FAIL** |
| `@floow/web` — webhook.test.ts | 6 passed | PASS |

**Root cause of actions.test.ts failure:** Commit `9b3613d` (fix: wrap financial operations in db.transaction) correctly updated `actions.ts` to use `db.transaction()` for atomicity, but did not update the test mock. The `setupDbMock()` helper in `actions.test.ts` returns a mock db object with only `{ insert, update }` — no `transaction` method. Every test path in `createTransaction` now calls `db.transaction(async (tx) => {...})` before any insert/update.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/__tests__/finance/actions.test.ts` | 75-79 | Mock missing `transaction` method after implementation updated | Blocker | All 6 action unit tests fail; the core transfer two-row behavior contract is untested |

No placeholder components, stub returns, or TODO markers found in any production files.

---

## Human Verification Required

### 1. Transfer Atomicity in Live DB

**Test:** Create a transfer from Account A to Account B for R$1.000,00
**Expected:** Account A balance decreases by R$1.000,00, Account B balance increases by R$1.000,00 atomically; two rows appear in /transactions with same transferGroupId
**Why human:** db.transaction() behavior in production Supabase cannot be verified by unit tests (which currently mock the DB layer)

### 2. OFX/CSV Import Deduplication

**Test:** Import the same OFX file twice to the same account
**Expected:** First import: "N imported, 0 skipped"; second import: "0 imported, N skipped"
**Why human:** `ON CONFLICT DO NOTHING` requires the UNIQUE INDEX `uq_transactions_external_account` to be applied to the live Supabase database via `supabase db push`

### 3. Dashboard Cash Flow Chart Visual

**Test:** Navigate to /dashboard after registering transactions in multiple months
**Expected:** Recharts BarChart renders green income bars and red expense bars per month with readable labels
**Why human:** Chart visual rendering quality and responsiveness cannot be verified by jsdom RTL tests

### 4. Patrimony Snapshot Refresh

**Test:** Click "Atualizar Snapshot" button on the dashboard
**Expected:** Button shows "Calculando..." spinner, then snapshot updates with current net worth values
**Why human:** useTransition and server action round-trip behavior requires browser interaction

---

## Gaps Summary

One gap blocks full automated verification: the `actions.test.ts` test suite fails because the mock DB object does not expose a `transaction` method. This happened when `db.transaction()` was correctly introduced for atomicity in commit `9b3613d`, but the test file was not updated in the same commit.

The underlying implementation is correct — `createTransaction` in `actions.ts` correctly uses `db.transaction()` with two inserts and two balance updates for transfers. The gap is purely in the test layer: the mock needs `transaction: vi.fn().mockImplementation(async (fn) => fn(db))` added to `setupDbMock()`, and the assertions need to capture calls on the `tx` callback argument rather than the outer `db` mock.

This is a test maintenance issue, not a functional regression. However, it means the automated contract for the transfer two-row behavior (the most critical invariant of the finance engine) is currently unverified by CI.

All other phase goals — schema, migration, UI pages, parsers, cash flow aggregation, dashboard, patrimony snapshot — are fully implemented and verified.

---

_Verified: 2026-03-10T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
