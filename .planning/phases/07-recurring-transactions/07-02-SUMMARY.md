---
phase: 07-recurring-transactions
plan: 02
subsystem: ui
tags: [nextjs, react, recurring, ui, components, sidebar]

# Dependency graph
requires:
  - phase: 07-01
    provides: createRecurringTemplate, updateRecurringTemplate, deleteRecurringTemplate, toggleRecurringActive, generateRecurringTransaction server actions and getRecurringTemplates, getUpcomingRecurring queries

provides:
  - /transactions/recurring page with upcoming-due section and template list
  - CreateRecurringDialog for create/edit recurring templates
  - RecurringTemplateList with CRUD, generate, and pause actions
  - Sidebar "Recorrentes" nav item under Cadastros

affects:
  - apps/web/components/layout/sidebar.tsx (nav item added)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inlined RecurringTemplate type in client component to avoid @floow/db bundling"
    - "Dialog uses native <dialog> element with useRef<HTMLDialogElement> — matches CreateRuleDialog pattern"
    - "Actions imported from @/lib/finance/recurring-actions (not actions.ts) per CLAUDE.md split"

key-files:
  created:
    - apps/web/components/finance/create-recurring-dialog.tsx
    - apps/web/components/finance/recurring-template-list.tsx
    - apps/web/app/(app)/transactions/recurring/page.tsx
  modified:
    - apps/web/components/layout/sidebar.tsx

key-decisions:
  - "PageHeader imported from @/components/ui/page-header (not @/components/shared/page-header — that path does not exist)"
  - "Recorrentes nav item placed in Cadastros section (no Financas section exists in sidebar)"
  - "RecurringTemplate.type widened to include transfer in inlined type — DB inference includes transfer even though recurring templates are always income/expense"

patterns-established:
  - "Page queries for upcoming as separate prop — template list receives pre-filtered upcoming directly from server"

requirements-completed: [REC-01, REC-02, REC-03, REC-04, REC-05]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 07 Plan 02: Recurring Transactions UI Summary

**Recurring templates page with CRUD dialog, upcoming-due section, generate/pause actions, and sidebar nav item — full UI for the 5 server actions from Plan 07-01**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T10:21:04Z
- **Completed:** 2026-03-29T10:24:08Z
- **Tasks:** 2 (+ 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Created `create-recurring-dialog.tsx` (281 lines) — native dialog with create/edit modes, all frequency options, pre-fill support
- Created `recurring-template-list.tsx` (339 lines) — upcoming-due section, all-templates table, 4 action handlers, empty state
- Created `/transactions/recurring/page.tsx` (31 lines) — server component fetching templates, upcoming, accounts, categories
- Added "Recorrentes" to sidebar "Cadastros" section with RefreshCw icon

## Task Commits

1. **Task 1: recurring templates UI** - `af0a75c` (feat)
2. **Task 2: sidebar Recorrentes nav item** - `f566f7a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/components/finance/create-recurring-dialog.tsx` - New: create/edit dialog with all 8 form fields
- `apps/web/components/finance/recurring-template-list.tsx` - New: template list with upcoming section, table, CRUD actions
- `apps/web/app/(app)/transactions/recurring/page.tsx` - New: server page component
- `apps/web/components/layout/sidebar.tsx` - Added RefreshCw import + Recorrentes nav item

## Decisions Made
- **PageHeader path correction:** Plan specified `@/components/shared/page-header` but actual location is `@/components/ui/page-header` (confirmed by categories/page.tsx pattern).
- **Sidebar section placement:** Plan said "Financas section" but no such section exists. Placed in "Cadastros" (where Contas and Categorias live — configuration/setup items).
- **RecurringTemplate.type widened:** DB schema infers `'income' | 'expense' | 'transfer'` for the type column, so inlined type includes transfer to avoid TypeScript errors. Template creation still enforces income/expense only in the server action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PageHeader import path correction**
- **Found during:** Task 1 (page.tsx creation)
- **Issue:** Plan specified `import { PageHeader } from '@/components/shared/page-header'` but that path doesn't exist. The actual location (confirmed from categories/page.tsx) is `@/components/ui/page-header`.
- **Fix:** Used correct import path `@/components/ui/page-header`.
- **Files modified:** apps/web/app/(app)/transactions/recurring/page.tsx
- **Verification:** TypeScript compiles without errors

**2. [Rule 1 - Bug] Sidebar Cadastros instead of Financas**
- **Found during:** Task 2 (sidebar inspection)
- **Issue:** Plan says to add item under "Financas section" with items Contas, Transacoes, Categorias. No such section exists. Contas+Categorias are in "Cadastros"; Transacoes is in "Dia a dia".
- **Fix:** Added "Recorrentes" to "Cadastros" section after "Categorias" — closest semantic match and where setup-level items live.
- **Files modified:** apps/web/components/layout/sidebar.tsx
- **Verification:** TypeScript compiles without errors

**3. [Rule 1 - Bug] RecurringTemplate.type widened to include 'transfer'**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** DB schema infers `type: 'income' | 'expense' | 'transfer'` for RecurringTemplateRow but inlined interface used `type: 'income' | 'expense'`. TypeScript errors on page.tsx assignments.
- **Fix:** Widened inlined interface type to `'income' | 'expense' | 'transfer'`. Server action still validates income/expense on creation.
- **Files modified:** apps/web/components/finance/recurring-template-list.tsx, apps/web/components/finance/create-recurring-dialog.tsx

---

**Total deviations:** 3 auto-fixed (all correctness bugs — wrong paths, wrong section name, type mismatch)
**Impact on plan:** All auto-fixes necessary; no scope creep.

## Known Stubs
None. All data flows from server to components via props. No hardcoded placeholders in UI paths.

## User Setup Required
None — feature is fully wired. Human verification (Task 3 checkpoint) still pending.

## Next Phase Readiness
- All UI ready for human verification (Task 3 checkpoint)
- Feature complete: CRUD + generate + pause/reactivate + sidebar navigation

## Self-Check: PASSED

- FOUND: apps/web/components/finance/create-recurring-dialog.tsx
- FOUND: apps/web/components/finance/recurring-template-list.tsx
- FOUND: apps/web/app/(app)/transactions/recurring/page.tsx
- FOUND: apps/web/components/layout/sidebar.tsx (modified)
- FOUND commit: af0a75c feat(07-02): add recurring templates UI
- FOUND commit: f566f7a feat(07-02): add Recorrentes nav item to sidebar

---
*Phase: 07-recurring-transactions*
*Completed: 2026-03-29*
