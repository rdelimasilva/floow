---
phase: 04-planning-engine
plan: 01
subsystem: planning-engine
tags: [tdd, pure-functions, db-schema, zod, simulation, financial-planning]
dependency_graph:
  requires: [03-investments-engine, packages/db/src/schema/auth.ts]
  provides: [retirementPlans-table, withdrawalStrategies-table, successionPlans-table, heirs-table, simulation.ts, withdrawal.ts, succession.ts, planning-zod-schemas]
  affects: [04-02-PLAN.md, 04-03-PLAN.md]
tech_stack:
  added: []
  patterns: [tdd-red-green-refactor, pure-function-engine, integer-cents, drizzle-uniqueIndex-upsert, rls-get-user-org-ids]
key_files:
  created:
    - packages/db/src/schema/planning.ts
    - packages/shared/src/schemas/planning.ts
    - supabase/migrations/00005_planning.sql
    - packages/core-finance/src/simulation.ts
    - packages/core-finance/src/withdrawal.ts
    - packages/core-finance/src/succession.ts
    - packages/core-finance/src/__tests__/simulation.test.ts
    - packages/core-finance/src/__tests__/withdrawal.test.ts
    - packages/core-finance/src/__tests__/succession.test.ts
  modified:
    - packages/db/src/index.ts
    - packages/db/src/client.ts
    - packages/shared/src/index.ts
    - packages/core-finance/src/index.ts
decisions:
  - "retirementPlans, withdrawalStrategies, successionPlans use uniqueIndex on orgId — one per org, enables onConflictDoUpdate upsert pattern (Drizzle)"
  - "validateHeirPercentages uses Math.round(sum) === 100 — handles floating-point precision (33.33 * 3 = 99.99 rounds correctly)"
  - "calcItcmd falls back to 5% for unknown state — conservative default when state not in table"
  - "ITCMD_RATES_BY_STATE uses maximum flat marginal rate — progressive tables deferred to v2; disclaimer required on UI"
  - "simulateRetirementScenario pushes current-age point first then applies growth — first point is always the initial portfolio (correct for chart display)"
  - "calculateFI uses annualRealReturnRate as safe withdrawal rate (with 0.04 fallback) — consistent real-terms math across simulation and FI calculator"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-18"
  tasks_completed: 3
  files_created: 9
  files_modified: 4
  tests_added: 48
  tests_total: 106
---

# Phase 04 Plan 01: Planning Engine — Data Layer and Computation Engine Summary

**One-liner:** Pure financial simulation engine (retirement/FI/withdrawal/succession) with 4 DB tables, 3 tested function modules, and Zod schemas — zero new dependencies.

## What Was Built

Complete data and computation foundation for Phase 4 Planning Engine:

1. **DB Schema** (`packages/db/src/schema/planning.ts`): 4 tables — `retirementPlans`, `withdrawalStrategies`, `successionPlans`, `heirs` — with uniqueIndex on `orgId` for the three one-per-org tables (enables upsert pattern), index on `successionPlanId` for heirs.

2. **SQL Migration** (`supabase/migrations/00005_planning.sql`): Creates all 4 tables with RLS policies using `get_user_org_ids()` pattern, unique indexes, and performance indexes matching the 00002/00003 pattern.

3. **Zod Schemas** (`packages/shared/src/schemas/planning.ts`): `retirementPlanSchema`, `withdrawalStrategySchema`, `successionPlanSchema`, `heirSchema` with appropriate type constraints and defaults.

4. **Simulation module** (`packages/core-finance/src/simulation.ts`): `simulateRetirementScenario` (yearly accumulation + withdrawal phases, floor at 0, integer cents), `calculateFI` (FI number = target*12/rate, year search with configurable limit), `SCENARIO_PRESETS` (conservative/base/aggressive with Brazilian market values).

5. **Withdrawal module** (`packages/core-finance/src/withdrawal.ts`): `simulateWithdrawal` supporting fixed-amount and percentage modes, depletion tracking with `depleted` flag, `withdrawalCents=0` after depletion, floor at 0.

6. **Succession module** (`packages/core-finance/src/succession.ts`): `ITCMD_RATES_BY_STATE` (all 27 Brazilian states, 2024-2025 max marginal rates), `calcItcmd` (lookup with 5% fallback, case-insensitive), `calcLiquidityGap` (ITCMD + funeral + legal + additional, gap floored at 0), `validateHeirPercentages` (sum==100 with float tolerance via Math.round).

## Test Results

- **48 new tests** added: 18 simulation, 11 withdrawal, 19 succession
- **106 total tests** in @floow/core-finance — all passing
- TDD cycle followed: RED (module not found → tests fail) → GREEN (implement → tests pass) → no refactor needed

## Deviations from Plan

### Pre-existing Issue (Logged, Not Fixed)

**`packages/core-finance/src/import/ofx.ts:55` — Pre-existing TypeScript error**
- **Found during:** Task 3 final verification
- **Issue:** `Argument of type 'string | number' is not assignable to parameter of type 'string'` — existed before Plan 04-01 changes (verified via git stash)
- **Action:** Logged to `deferred-items.md`; not fixed (out of scope, pre-existing)
- **Impact:** None on new planning modules — simulation.ts, withdrawal.ts, succession.ts compile cleanly

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | 6dfdb36 | feat(04-01): add planning DB schema, SQL migration, and Zod schemas |
| Task 2 | ba47e42 | feat(04-01): simulation and FI pure functions with TDD (18 tests green) |
| Task 3 | 11ace25 | feat(04-01): withdrawal and succession pure functions with TDD, barrel export (30 tests green) |

## Self-Check: PASSED

All 6 created files confirmed on disk. All 3 commits confirmed in git log.
