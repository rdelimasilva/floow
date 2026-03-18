---
phase: 04-planning-engine
plan: 02
subsystem: planning-ui
tags: [planning, retirement-simulation, fi-calculator, recharts, server-actions, rsc, suspense]
dependency_graph:
  requires: [04-01-planning-engine-data-layer, 03-investments-engine]
  provides: [planning-pages, planning-nav, retirement-simulation-ui, fi-calculator-ui, planning-hub]
  affects: [04-03-PLAN.md]
tech_stack:
  added: []
  patterns: [rsc-suspense-streaming, server-actions-upsert, client-side-realtime-computation, submodule-imports-browser-safe]
key_files:
  created:
    - apps/web/lib/planning/queries.ts
    - apps/web/lib/planning/actions.ts
    - apps/web/components/planning/retirement-simulation-chart.tsx
    - apps/web/components/planning/simulation-form.tsx
    - apps/web/components/planning/fi-calculator-form.tsx
    - apps/web/components/planning/planning-summary-row.tsx
    - apps/web/app/(app)/planning/simulation/page.tsx
    - apps/web/app/(app)/planning/fi-calculator/page.tsx
    - apps/web/app/(app)/planning/page.tsx
  modified:
    - apps/web/components/layout/sidebar.tsx
decisions:
  - "formatBRL used as formatBRL(cents/100) in planning components — planning module stores and computes in integer cents (consistent with rest of app), but formatBRL expects a value in BRL units (already established pattern)"
  - "SimulationForm uses mode:'onChange' with watch() for real-time chart — triggers re-computation on every keystroke without submit; useMemo prevents redundant recalculation"
  - "validateHeirPercentages called with shares.map(h => h.percentageShare) — function takes number[] not heir objects (Rule 1 auto-fix applied during Task 1)"
  - "Submodule imports used in all client components (e.g. @floow/core-finance/src/simulation) — prevents webpack bundling ofx-js into browser bundle (established Phase 02-04 pattern)"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-18"
  tasks_completed: 3
  files_created: 9
  files_modified: 1
  tests_added: 0
  tests_total: 106
---

# Phase 04 Plan 02: Planning Engine — UI Pages and Navigation Summary

**One-liner:** Three planning pages (/planning, /planning/simulation, /planning/fi-calculator) with real-time Recharts 3-scenario chart, FI calculator, and 4-card hub — all auto-filled from existing investment data.

## What Was Built

Complete UI layer for the Planning Engine (Plan 04-02):

1. **Server queries** (`apps/web/lib/planning/queries.ts`): `getRetirementPlan`, `getWithdrawalStrategy`, `getSuccessionPlan`, `getHeirs`, `getPlanningDashboardData` — all wrapped in React `cache()`, using the Drizzle select-first pattern.

2. **Server actions** (`apps/web/lib/planning/actions.ts`): `saveRetirementPlan`, `saveWithdrawalStrategy`, `saveSuccessionPlan` — upsert via `onConflictDoUpdate` on orgId unique index. Succession plan uses `db.transaction()` to atomically upsert plan + replace all heirs. Numeric DB fields (`inflationRate`, `baseReturnRate`, etc.) stored as strings (Drizzle `numeric` type) and converted to/from `number` at action boundaries.

3. **RetirementSimulationChart** (`apps/web/components/planning/retirement-simulation-chart.tsx`): `'use client'` Recharts `LineChart` with 3 color-coded lines (conservative=red, base=blue, aggressive=green), `ReferenceLine` at `retirementAge` labeled "Aposentadoria", nominal/real toggle via `useMemo` inflation adjustment, ChartContainer pattern from NetWorthEvolution.

4. **SimulationForm** (`apps/web/components/planning/simulation-form.tsx`): `'use client'` with react-hook-form + zodResolver. Real-time projection re-computation via `useMemo(watched)` — updates chart on every input change without submit. Collapsible advanced section for per-scenario rate overrides. "Salvar Plano" calls `saveRetirementPlan`. Displays FI result (date + years, or "not achievable" message).

5. **FICalculatorForm** (`apps/web/components/planning/fi-calculator-form.tsx`): Focused FI inputs with real-time `calculateFI` result display. Prominent result card shows FI number (R$), date, years remaining, and animated progress bar (`currentPortfolio / fiNumber`). Pre-fills from saved retirement plan.

6. **PlanningSummaryRow** (`apps/web/components/planning/planning-summary-row.tsx`): 4-card responsive grid (1/2/4 cols) — passive income, FI progress with mini progress bar, withdrawal strategy status, succession plan status. Each card is a `Link` to its detail page.

7. **Simulation page** (`apps/web/app/(app)/planning/simulation/page.tsx`): RSC + Suspense streaming. Fetches positions, income events, saved plan in parallel. Auto-computes `currentPortfolioCents` (sum of position values) and `currentPassiveIncomeCents` (`estimateMonthlyIncome`).

8. **FI Calculator page** (`apps/web/app/(app)/planning/fi-calculator/page.tsx`): Same RSC pattern, same data fetching as simulation page.

9. **Planning Hub page** (`apps/web/app/(app)/planning/page.tsx`): RSC + Suspense. Shows `PlanningSummaryRow` + 4 descriptive nav cards linking to all sub-pages. Computes live FI progress from saved plan + current portfolio. Includes financial disclaimer at bottom.

10. **Sidebar navigation** (`apps/web/components/layout/sidebar.tsx`): Added `{ href: '/planning', label: 'Planejamento', icon: Target }` before billing entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] validateHeirPercentages called with wrong type**
- **Found during:** Task 1 TypeScript verification
- **Issue:** Plan said "validate heir percentages" but `validateHeirPercentages` takes `number[]` not `HeirInput[]`; initial implementation passed full heir objects
- **Fix:** Changed to `validatedHeirs.map((h) => h.percentageShare)` to extract number shares
- **Files modified:** `apps/web/lib/planning/actions.ts`
- **Commit:** 42dfef5

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | 42dfef5 | feat(04-02): server queries, actions, and sidebar nav for planning engine |
| Task 2 | 120f46e | feat(04-02): retirement simulation page with 3-scenario chart |
| Task 3 | 7b56d82 | feat(04-02): FI calculator page and planning hub dashboard |

## Self-Check: PASSED

All 9 created files confirmed below. All 3 commits confirmed in git log.
