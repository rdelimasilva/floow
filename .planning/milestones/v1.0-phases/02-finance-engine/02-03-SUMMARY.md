---
phase: 02-finance-engine
plan: 03
subsystem: finance-import
tags: [ofx, csv, papaparse, ofx-js, recharts, shadcn, server-actions, tdd, import, cash-flow]

# Dependency graph
requires:
  - phase: 02-01
    provides: uq_transactions_external_account UNIQUE index for ON CONFLICT DO NOTHING dedup
  - phase: 02-02
    provides: lib/finance/queries.ts (getOrgId, getAccounts), lib/finance/actions.ts pattern

provides:
  - OFX parser (parseOFXDate, parseOFXFile) with FITID extraction and OFX date handling
  - CSV parser (parseCSVFile, CsvColumnMapping) with dd/MM/yyyy and yyyy-MM-dd support
  - Cash flow aggregation (aggregateCashFlow) grouped by YYYY-MM, sorted descending
  - /transactions/import page with file upload, preview table, and import confirmation
  - importTransactions server action with ON CONFLICT DO NOTHING deduplication
  - CashFlowChart component (shadcn ChartContainer + Recharts BarChart) for dashboard use

affects:
  - 02-04: dashboard (imports CashFlowChart and aggregateCashFlow)

# Tech tracking
tech-stack:
  added:
    - ofx-js in @floow/core-finance (OFX SGML parsing)
    - papaparse + @types/papaparse in @floow/core-finance (CSV parsing)
    - recharts 2.15.4 in @floow/web (via shadcn chart install)
    - shadcn chart component (ChartContainer, ChartTooltip, ChartTooltipContent)
    - shadcn table component (Table, TableHeader, TableBody, TableRow, TableHead, TableCell)
  patterns:
    - OFX dates parsed manually (YYYYMMDD slice) — never passed to new Date() raw (Pitfall 2)
    - CSV externalId generated as base64 hash of row JSON with csv- prefix for deterministic dedup
    - onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] }) for import dedup
    - CashFlowChart uses min-h-[300px] on ChartContainer to prevent zero-height render (Pitfall 7)
    - Balance delta computed from .returning() of insert — only actually-inserted rows counted

key-files:
  created:
    - packages/core-finance/src/import/ofx.ts
    - packages/core-finance/src/import/csv.ts
    - packages/core-finance/src/cash-flow.ts
    - packages/core-finance/src/types/ofx-js.d.ts
    - packages/core-finance/src/__tests__/import-ofx.test.ts
    - packages/core-finance/src/__tests__/import-csv.test.ts
    - packages/core-finance/src/__tests__/cash-flow.test.ts
    - apps/web/lib/finance/import-actions.ts
    - apps/web/components/finance/import-form.tsx
    - apps/web/components/finance/cash-flow-chart.tsx
    - apps/web/components/ui/chart.tsx
    - apps/web/components/ui/table.tsx
    - apps/web/app/(app)/transactions/import/page.tsx
  modified:
    - packages/core-finance/src/index.ts (added exports for import/ofx, import/csv, cash-flow)
    - packages/core-finance/package.json (added ofx-js, papaparse deps)
    - apps/web/package.json (added recharts, @floow/core-finance dep via shadcn)
    - pnpm-lock.yaml

key-decisions:
  - "ofx-js.d.ts placed in packages/core-finance/src/types/ so web typecheck resolves it when compiling core-finance source via path alias"
  - "CashFlowChart negates expense values for display (both bars render above X axis) while raw data keeps negative amountCents convention"
  - "importTransactions balance update uses .returning() amountCents from inserted rows to avoid counting skipped duplicates in balance delta"

# Metrics
duration: 9min
completed: 2026-03-11
---

# Phase 2 Plan 03: OFX/CSV Import Parsers and Cash Flow Aggregation Summary

**OFX/CSV parsers with TDD (31 tests), cash flow aggregation, import page with preview/dedup server action, and CashFlowChart component — all using ofx-js and papaparse with Brazilian bank format support**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-11T00:49:38Z
- **Completed:** 2026-03-11T00:58:58Z
- **Tasks:** 2 completed
- **Files modified:** 14

## Accomplishments

- OFX parser (`parseOFXDate` + `parseOFXFile`) handles Brazilian bank OFX SGML with FITID extraction and correct date parsing (YYYYMMDD slice — not ISO 8601 raw parse, avoids Pitfall 2)
- CSV parser (`parseCSVFile` + `CsvColumnMapping`) supports dd/MM/yyyy and yyyy-MM-dd formats, empty line skipping, and deterministic base64 externalId for deduplication
- Cash flow aggregation (`aggregateCashFlow`) groups transactions by YYYY-MM, separates income/expense totals, calculates net, sorts descending
- 31 unit tests pass: 8 OFX tests (date parsing, amount sign, FITID), 9 CSV tests (date formats, empty lines, deterministic IDs), 7 cash flow tests (grouping, sort, net calc), 7 existing balance tests
- Import page at `/transactions/import` with 4-step state machine: select file -> column mapping + preview -> importing -> done
- `importTransactions` server action uses `onConflictDoNothing({ target: [transactions.externalId, transactions.accountId] })` for deduplication; balance update uses inserted rows from `.returning()`
- `CashFlowChart` component (shadcn ChartContainer + Recharts BarChart) with `min-h-[300px]` guard against zero-height render; ready for dashboard (Plan 02-04)
- TypeScript typecheck and Next.js build both pass; `/transactions/import` route visible in build output

## Task Commits

1. **Task 1: OFX/CSV parsers, cash flow aggregation, and tests** — `e93d5b6` (feat, TDD)
2. **Task 2: Import page UI, server action, CashFlowChart** — `6c2e675` (feat)

Note: Task 1 was already committed by the plan 02-02 executor (which included all 02-03 Task 1 artifacts). This was discovered at execution start — no re-work needed.

## Files Created/Modified

- `packages/core-finance/src/import/ofx.ts` — parseOFXDate, parseOFXFile using ofx-js
- `packages/core-finance/src/import/csv.ts` — parseCSVFile, CsvColumnMapping using papaparse
- `packages/core-finance/src/cash-flow.ts` — aggregateCashFlow with month grouping and sort
- `packages/core-finance/src/types/ofx-js.d.ts` — ambient declaration for ofx-js (no @types package)
- `packages/core-finance/src/__tests__/import-ofx.test.ts` — 8 OFX parser tests
- `packages/core-finance/src/__tests__/import-csv.test.ts` — 9 CSV parser tests
- `packages/core-finance/src/__tests__/cash-flow.test.ts` — 7 cash flow tests
- `packages/core-finance/src/index.ts` — exports added for import/ofx, import/csv, cash-flow
- `packages/core-finance/package.json` — ofx-js, papaparse, @types/papaparse deps
- `apps/web/lib/finance/import-actions.ts` — importTransactions server action
- `apps/web/components/finance/import-form.tsx` — 4-step import UI client component
- `apps/web/components/finance/cash-flow-chart.tsx` — Recharts BarChart via shadcn ChartContainer
- `apps/web/components/ui/chart.tsx` — shadcn chart component (installed)
- `apps/web/components/ui/table.tsx` — shadcn table component (installed)
- `apps/web/app/(app)/transactions/import/page.tsx` — RSC import page
- `apps/web/package.json` — recharts, @floow/core-finance added

## Decisions Made

- `ofx-js.d.ts` in `packages/core-finance/src/types/` — placed inside the `src/` tree so that `@floow/web`'s tsconfig path alias (`"@floow/core-finance": ["../../packages/core-finance/src"]`) resolves it correctly when compiling cross-package
- CashFlowChart negates expense absolute value for chart display (both bars render above X axis) while preserving negative `amountCents` convention in raw data
- Balance delta after import computed from `.returning({ amountCents })` — only actually-inserted rows counted, not skipped duplicates

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing ofx-js type declarations caused TS7016 error in web typecheck**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `ofx-js` has no `@types/ofx-js` package; TypeScript 7016 "Could not find a declaration file" error prevented `pnpm turbo run typecheck --filter=@floow/web` from passing
- **Fix:** The prior executor had already created `packages/core-finance/ofx-js.d.ts` (root level) and added `@ts-ignore` to the import. However, the root-level `.d.ts` was not in the web's TypeScript compilation scope. Moved the ambient declaration to `packages/core-finance/src/types/ofx-js.d.ts` so it's included via the web's path alias resolution
- **Files modified:** `packages/core-finance/src/types/ofx-js.d.ts` (created)
- **Commit:** `6c2e675`

**2. [Rule 1 - Discovery] Plan 02-02 pre-executed all Task 1 artifacts**
- **Found during:** Task 1 (git status check after dependency install)
- **What happened:** The 02-02 plan executor committed `packages/core-finance/src/import/ofx.ts`, `csv.ts`, `cash-flow.ts`, and all test files in commit `e93d5b6`. Files were identical to what this plan would have created.
- **Action:** Tests confirmed GREEN (31 passing). No re-work needed. Task 1 credited to `e93d5b6`.

---

**Total deviations:** 1 auto-fixed (Rule 3 — missing type declaration), 1 informational (pre-existing Task 1 work)
**Impact on plan:** No scope changes. All plan artifacts delivered.

## Issues Encountered

None beyond deviations documented above.

## User Setup Required

None — import page is functional once the app is deployed. Users can access `/transactions/import` after sign-in.

## Next Phase Readiness

- `CashFlowChart` component exported and ready for Plan 02-04 dashboard integration
- `aggregateCashFlow` exported from `@floow/core-finance` — dashboard can import and call it
- `/transactions/import` route live — FIN-05 requirement fulfilled
- All 31 core-finance tests green
- Web typecheck and build pass

---
*Phase: 02-finance-engine*
*Completed: 2026-03-11*

## Self-Check: PASSED

- [x] packages/core-finance/src/import/ofx.ts — exists
- [x] packages/core-finance/src/import/csv.ts — exists
- [x] packages/core-finance/src/cash-flow.ts — exists
- [x] packages/core-finance/src/__tests__/import-ofx.test.ts — exists, 8 tests pass
- [x] packages/core-finance/src/__tests__/import-csv.test.ts — exists, 9 tests pass
- [x] packages/core-finance/src/__tests__/cash-flow.test.ts — exists, 7 tests pass
- [x] apps/web/lib/finance/import-actions.ts — exists
- [x] apps/web/components/finance/import-form.tsx — exists
- [x] apps/web/components/finance/cash-flow-chart.tsx — exists
- [x] apps/web/app/(app)/transactions/import/page.tsx — exists
- [x] Commit e93d5b6 — verified in git log (Task 1)
- [x] Commit 6c2e675 — verified in git log (Task 2)
- [x] pnpm --filter @floow/core-finance test: 31 passed
- [x] pnpm turbo run typecheck --filter=@floow/web: passed
- [x] pnpm turbo run build --filter=@floow/web: passed, /transactions/import route in build output
