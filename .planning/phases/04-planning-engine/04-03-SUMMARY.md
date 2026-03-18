---
phase: 04-planning-engine
plan: 03
subsystem: planning-engine
tags: [withdrawal, succession, itcmd, depletion-chart, heir-management, recharts]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [withdrawal-page, succession-page, depletion-chart, heir-list, planning-queries, planning-actions]
  affects: []
tech_stack:
  added: []
  patterns: [rsc-suspense, usememo-client-simulation, upsert-onconflict, drizzle-transaction]
key_files:
  created:
    - apps/web/components/planning/depletion-chart.tsx
    - apps/web/components/planning/withdrawal-form.tsx
    - apps/web/app/(app)/planning/withdrawal/page.tsx
    - apps/web/components/planning/heir-list.tsx
    - apps/web/components/planning/succession-form.tsx
    - apps/web/app/(app)/planning/succession/page.tsx
  modified: []
decisions:
  - "DepletionChart uses ReferenceLine at depletionAge with red stroke — visually distinct from portfolio line"
  - "WithdrawalForm stores rates as percentage input (e.g. 4 for 4%) and converts to decimal on save/simulate"
  - "HeirList uses local React state with callback props pattern — parent SuccessionForm owns canonical state"
  - "liquidAssetsCents computed from latest patrimony snapshot (snapshotDate); falls back to 0 if no snapshot"
  - "saveSuccessionPlan wraps succession plan upsert + heir delete/insert in a single db.transaction() for atomicity"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-18"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
  checkpoint_at: task-3
---

# Phase 04 Plan 03: Withdrawal Strategy and Succession Planning Pages — Summary

**One-liner:** Withdrawal strategy page (fixed/percentage depletion chart) and succession planning page (heir management, ITCMD estimation, liquidity gap) with real-time client-side simulation and DB persistence.

## What Was Built

### Task 1: Withdrawal Strategy Page

1. **DepletionChart** (`apps/web/components/planning/depletion-chart.tsx`): Recharts LineChart showing portfolio value over time during withdrawal phase. Displays a red `ReferenceLine` at `depletionAge` (first point where `depleted === true`). X-axis: age; Y-axis: portfolio in BRL via `formatBRL`. Follows `NetWorthEvolution` component pattern.

2. **WithdrawalForm** (`apps/web/components/planning/withdrawal-form.tsx`): Client component with mode toggle (fixed/percentage), liquidation preset selector, and growth rate input. Uses `useMemo` to re-simulate on every input change via `simulateWithdrawal`. Shows depletion age (fixed mode) or estimated monthly income (percentage mode). Calls `saveWithdrawalStrategy` server action.

3. **Withdrawal Page** (`apps/web/app/(app)/planning/withdrawal/page.tsx`): RSC fetching `getWithdrawalStrategy`, `getRetirementPlan`, and `getPositions` in parallel. Computes `currentPortfolioCents` from positions, extracts `retirementAge`/`lifeExpectancy` from saved plan (defaults: 65/85).

Also created/confirmed `apps/web/lib/planning/queries.ts` and `apps/web/lib/planning/actions.ts` as prerequisites (Plan 02 outputs already present on disk).

### Task 2: Succession Planning Page

1. **HeirList** (`apps/web/components/planning/heir-list.tsx`): Dynamic heir rows with name text input, relationship dropdown (Cônjuge/Filho/Neto/Pai-Mãe/Irmão/Outro), percentage input, and remove button. Running total row with green/red color coding. Error message when sum ≠ 100%.

2. **SuccessionForm** (`apps/web/components/planning/succession-form.tsx`): State selector dropdown with all 27 Brazilian states from `ITCMD_RATES_BY_STATE`, collapsible cost estimation section (funeral/legal fees/additional liabilities), real-time `calcLiquidityGap` computation via `useMemo`. Results card shows total estate, ITCMD estimate, settlement costs, available liquidity, and gap. Per-heir breakdown table. Legal disclaimer. Calls `saveSuccessionPlan`.

3. **Succession Page** (`apps/web/app/(app)/planning/succession/page.tsx`): RSC fetching succession plan, heirs (if plan exists), positions, and latest patrimony snapshot in parallel. Computes `liquidAssetsCents` from snapshot (fallback: 0).

## Deviations from Plan

### Auto-discovered: Plan 02 pages already on disk

**Found during:** Task 1 setup
**Issue:** Plan 02 (simulation page, FI calculator, planning hub, planning-summary-row, simulation-form, retirement-simulation-chart, fi-calculator-form) was not listed in git log as committed, but all files existed on disk.
**Action:** Files treated as existing — verified TypeScript passes, no duplication. `lib/planning/queries.ts` and `lib/planning/actions.ts` were also already present.
**Impact:** None — execution continued normally.

### Rule 3: lib/planning queries and actions prerequisite

**Found during:** Task 1 — `saveWithdrawalStrategy` and `getWithdrawalStrategy` required
**Issue:** Plan 03 depends on these Plan 02 outputs. They existed on disk but had not been committed.
**Action:** Files staged and included in Task 1 commit.

## Checkpoint State

Task 3 is a `checkpoint:human-verify` — execution paused. Human verification of all 5 planning features required before plan completion.

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | c9c9eb7 | feat(04-03): withdrawal strategy page with depletion chart |
| Task 2 | ef1cd16 | feat(04-03): succession planning page with heir management and ITCMD |

## Self-Check: PARTIAL (checkpoint not yet verified)

Tasks 1 and 2 complete. Awaiting Task 3 human verification to finalize.

**Files created confirmed:**
- apps/web/components/planning/depletion-chart.tsx: FOUND
- apps/web/components/planning/withdrawal-form.tsx: FOUND
- apps/web/app/(app)/planning/withdrawal/page.tsx: FOUND
- apps/web/components/planning/heir-list.tsx: FOUND
- apps/web/components/planning/succession-form.tsx: FOUND
- apps/web/app/(app)/planning/succession/page.tsx: FOUND

**Commits confirmed:**
- c9c9eb7: FOUND
- ef1cd16: FOUND
