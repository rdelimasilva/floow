---
status: awaiting_human_verify
trigger: "platform-slow-performance — all pages load slowly, navigation is slow, always been this way"
created: 2026-03-22T00:00:00Z
updated: 2026-03-22T02:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — 4 compounding issues found and fixed
test: All fixes applied, awaiting user verification
expecting: Significantly faster page loads and navigation
next_action: User verifies fix in browser

## Symptoms

expected: Pages should load quickly (under 1-2 seconds), navigation between menus should be near-instant
actual: All pages load slowly, menus take a long time to appear, both initial load and page transitions are slow
errors: No specific errors — purely a performance issue
reproduction: Open any page on the platform, navigate between any menus
started: Always been slow since the beginning of the project

## Eliminated

- hypothesis: Heavy/unnecessary npm dependencies
  evidence: Dependencies are appropriate for app scope — recharts, radix-ui, tanstack-query all justified. No massive bundle culprits.
  timestamp: 2026-03-22T01:00:00Z

- hypothesis: Server vs client component misuse causing large JS bundles sent to browser
  evidence: Pages are server components. "use client" is only on interactive components (forms, charts, sidebar). Architecture is correct.
  timestamp: 2026-03-22T01:00:00Z

- hypothesis: Database query design problems (N+1, missing indexes)
  evidence: Queries use proper joins, indexes exist on org_id+date+balance_applied. getTransactionsWithCount uses COUNT OVER() window function — no N+1. Investment queries use DISTINCT ON for prices. Good.
  timestamp: 2026-03-22T01:00:00Z

## Evidence

- timestamp: 2026-03-22T01:00:00Z
  checked: apps/web/app/(app)/layout.tsx
  found: reconcileRecurringBalances() was called on EVERY page navigation (in the shared app layout). Even with the short-circuit check, this still incurred 1-2 DB round-trips per navigation.
  implication: HIGH IMPACT — every page load triggered a DB query (sometimes a write transaction). Removed from layout, moved to background fetch via POST /api/reconcile.

- timestamp: 2026-03-22T01:00:00Z
  checked: apps/web/app/(app)/dashboard/page.tsx lines 22 and 37
  found: getRecentTransactions(orgId, 6) was called TWICE (StatsSection and ChartSection) without React cache(). Two identical large DB queries per dashboard load.
  implication: HIGH IMPACT — fixed by wrapping getRecentTransactions in cache() in queries.ts.

- timestamp: 2026-03-22T01:00:00Z
  checked: apps/web/app/(app)/dashboard/page.tsx BudgetAlertSection for-loop lines 92-106
  found: Sequential for-loop awaiting queries per investing goal. 3 goals = 6 sequential DB queries.
  implication: MEDIUM IMPACT — fixed by converting to Promise.all(goals.map(async...)).

- timestamp: 2026-03-22T01:00:00Z
  checked: apps/web/components/layout/sidebar-context.tsx
  found: SidebarProvider started with collapsed=false, read localStorage in useEffect — causing layout shift and full re-render on every page load (content shifts from 56px to 224px sidebar width).
  implication: MEDIUM IMPACT — fixed by reading cookie server-side and passing defaultCollapsed prop to SidebarProvider.

- timestamp: 2026-03-22T01:00:00Z
  checked: apps/web/middleware.ts
  found: runtime: 'nodejs' in middleware config is not a valid Next.js middleware config option.
  implication: LOW — removed the invalid field.

- timestamp: 2026-03-22T01:00:00Z
  checked: lib/finance/queries.ts
  found: getLatestSnapshot was also not wrapped in cache(). Added cache() for consistency.
  implication: LOW-MEDIUM — prevents duplicate calls in the future.

## Resolution

root_cause: |
  Four compounding issues:
  1. reconcileRecurringBalances() in app layout — DB query/write on every page navigation
  2. getRecentTransactions called twice on dashboard without React cache() — double DB query
  3. BudgetAlertSection sequential for-loop — waterfall DB queries per investing goal
  4. SidebarProvider layout shift — re-render flash on every page from localStorage useEffect

fix: |
  1. Removed reconcileRecurringBalances() from layout.tsx. Created POST /api/reconcile route.
     Added ReconcileProvider (client component) that fires fire-and-forget fetch after mount.
  2. Wrapped getRecentTransactions and getLatestSnapshot in React cache() in queries.ts.
  3. Converted for-loop in BudgetAlertSection to Promise.all(goals.map(async...)).
  4. Switched SidebarProvider from localStorage useEffect to cookie+defaultCollapsed prop.
     Layout reads cookie server-side and passes initial state — zero layout shift.
  5. Removed invalid runtime: 'nodejs' from middleware config.

verification: awaiting user confirmation

files_changed:
  - apps/web/app/(app)/layout.tsx
  - apps/web/lib/finance/queries.ts
  - apps/web/app/(app)/dashboard/page.tsx
  - apps/web/components/layout/sidebar-context.tsx
  - apps/web/middleware.ts
  - apps/web/app/api/reconcile/route.ts (new)
  - apps/web/components/providers/reconcile-provider.tsx (new)
