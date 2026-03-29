---
phase: 07-recurring-transactions
verified: 2026-03-29T11:00:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Create a recurring template and confirm it appears in the list immediately"
    expected: "Template visible in 'Todas as recorrencias' table with correct description, account, type, amount, frequency, next due date, and 'Ativo' status"
    why_human: "Server-side revalidation and UI state update require a running browser to confirm"
  - test: "Edit a template via pencil icon, change the description, save, and verify update"
    expected: "Dialog pre-fills with existing values; after save, table row shows the new description"
    why_human: "Edit-mode pre-fill and optimistic update require browser interaction"
  - test: "Delete a template — confirm dialog shows preservation message, then remove"
    expected: "ConfirmDialog appears with text about keeping generated transactions; template removed from list; previously generated transactions still visible in /transactions"
    why_human: "Delete confirmation flow and cross-page persistence require browser"
  - test: "Click 'Gerar agora' on an overdue template and verify transaction creation"
    expected: "Toast shows 'N transacao(oes) gerada(s)'; /transactions shows the new entry; account balance updated in /accounts; next due date advances by one frequency period"
    why_human: "Balance mutation, transaction visibility, and date advancement require live DB and browser"
  - test: "Click 'Gerar agora' a second time on the same template immediately after generating"
    expected: "Toast shows 'Nenhuma transacao a gerar — proxima data no futuro.' — no duplicate transaction created"
    why_human: "Dedup via unique index requires running database to confirm"
  - test: "Pause a template via the Pause icon; verify it disappears from 'Proximas a vencer' section"
    expected: "Status column changes to 'Pausado'; if template was in upcoming section, it is removed from that section (since getUpcomingRecurring filters isActive=true)"
    why_human: "Server revalidation of upcoming section requires browser"
  - test: "Reactivate the paused template via Play icon; verify nextDueDate is unchanged"
    expected: "Status reverts to 'Ativo'; next due date is the same value as before pausing"
    why_human: "State preservation across pause/reactivate cycle requires browser"
---

# Phase 07: Recurring Transactions Verification Report

**Phase Goal:** Users can define recurring transaction templates and generate transactions on demand, eliminating repetitive manual entry for predictable expenses and income
**Verified:** 2026-03-29T11:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a recurring template with account, category, type, amount, description, frequency, and start date — template appears in list immediately | VERIFIED | `createRecurringTemplate` in `recurring-actions.ts` (lines 29-76) validates all fields, calls `assertAccountOwnership`, inserts row, calls `revalidatePath('/transactions/recurring')`. Dialog in `create-recurring-dialog.tsx` exposes all 8 fields. |
| 2 | User can edit and delete recurring templates | VERIFIED | `updateRecurringTemplate` (lines 86-144) and `deleteRecurringTemplate` (lines 154-166) present. Edit wired via pencil icon opening `CreateRecurringDialog` with `editTemplate` prop; delete wired via `ConfirmDialog` with preservation message. |
| 3 | User can click "Gerar agora" on a template to create transactions and advance the next due date — clicking twice does not create a duplicate | VERIFIED | `generateRecurringTransaction` (lines 217-312) uses `onConflictDoNothing()` on `uq_generated_transactions` (recurring_template_id, date) unique index; advances `nextDueDate` via `advanceByFrequency`; returns `{ generated: 0 }` on re-click. "Gerar agora" button wired in `recurring-template-list.tsx` `handleGenerate`. |
| 4 | User can view a list of all recurring templates due in the next 30 days from /transactions/recurring | VERIFIED | `getUpcomingRecurring` queries `isActive=true AND nextDueDate <= now+30d`. Page passes `upcoming` prop to `RecurringTemplateList`. NOTE: "Proximas a vencer" section further filters to `isOverdue(nextDueDate)` — only overdue/today items appear there. Templates due in 2-30 days are still visible in "Todas as recorrencias" table. This is a design choice, not a blocker. |
| 5 | User can pause a recurring template and reactivate it without losing generated transaction history | VERIFIED | `toggleRecurringActive` (lines 176-197) flips `isActive` without touching any transactions; FK `ON DELETE SET NULL` preserved; `deleteRecurringTemplate` explicitly noted to preserve history. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/db/src/schema/automation.ts` | VERIFIED | `recurringTemplates` pgTable present (lines 43-80); all columns match migration 00006_automation.sql including extra fields (endMode, installmentCount, endDate, transferDestinationAccountId); `RecurringTemplateRow` and `NewRecurringTemplateRow` exported as aliases (lines 76-80); nextDueDate index present. |
| `packages/db/src/schema/finance.ts` | VERIFIED | `recurringTemplateId: uuid('recurring_template_id')` on transactions table (line 98); no circular FK reference — intentional per plan. |
| `apps/web/lib/finance/recurring-actions.ts` | VERIFIED | 312 lines; 5 server actions present: `createRecurringTemplate`, `updateRecurringTemplate`, `deleteRecurringTemplate`, `toggleRecurringActive`, `generateRecurringTransaction`. Deviation from plan: created as separate file instead of adding to `actions.ts` (500-line CLAUDE.md limit). Functionally equivalent. |
| `apps/web/lib/finance/queries.ts` | VERIFIED | `getRecurringTemplates` (line 334) and `getUpcomingRecurring` (line 347) present; correct filters and `asc(recurringTemplates.nextDueDate)` ordering. |
| `apps/web/app/(app)/transactions/recurring/page.tsx` | VERIFIED | 31 lines; server component using `Promise.all` to fetch templates, upcoming, accounts, categories; passes all as props to `RecurringTemplateList`. |
| `apps/web/components/finance/recurring-template-list.tsx` | VERIFIED | 339 lines; two-section layout (upcoming + all templates); all 4 action handlers implemented; proper empty state; `ConfirmDialog` with preservation message on delete. |
| `apps/web/components/finance/create-recurring-dialog.tsx` | VERIFIED | 281 lines; native `<dialog>` element with `useRef`; all 8 form fields; pre-fill from `editTemplate` prop; create and edit modes; backdrop click closes. |
| `apps/web/components/layout/sidebar.tsx` | VERIFIED | `RefreshCw` icon imported (line 28); "Recorrentes" nav item at `/transactions/recurring` present (line 95) in Cadastros section. Deviation from plan: placed in "Cadastros" not "Financas" (no Financas section exists in sidebar). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `recurring-actions.ts` | `@floow/db` (automation.ts) | `import { recurringTemplates }` | WIRED | Line 11: `import { getDb, accounts, transactions, recurringTemplates } from '@floow/db'` |
| `recurring-actions.ts` | `@floow/core-finance` (recurring.ts) | `import { advanceByFrequency, getOverdueDates }` | WIRED | Line 12: `import { matchCategory, advanceByFrequency, getOverdueDates } from '@floow/core-finance'` |
| `recurring-actions.ts` | `queries.ts` | `import { getCategoryRules }` | WIRED | Line 14: `import { getOrgId, getCategoryRules } from './queries'` |
| `queries.ts` | `@floow/db` (automation.ts) | `import { recurringTemplates }` | WIRED | Line 4 of queries.ts: `recurringTemplates` included in `@floow/db` import |
| `recurring-template-list.tsx` | `recurring-actions.ts` | `import { deleteRecurringTemplate, toggleRecurringActive, generateRecurringTransaction }` | WIRED | Lines 6-9; all three actions called in handlers |
| `recurring-template-list.tsx` | `create-recurring-dialog.tsx` | `CreateRecurringDialog` rendered with optional `editTemplate` | WIRED | Lines 311-325: both create and edit dialog instances present |
| `page.tsx` | `queries.ts` | `import { getRecurringTemplates, getUpcomingRecurring, getOrgId, getAccounts, getCategories }` | WIRED | Line 1 of page.tsx; all 5 functions called in `Promise.all` |

**Note on plan deviation:** Plan 07-01 key links listed `actions.ts` as the "from" file for recurring server actions. Implementation correctly placed them in `recurring-actions.ts` due to CLAUDE.md 500-line limit. All connections are functionally identical.

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `recurring-template-list.tsx` | `templates`, `upcoming` | `getRecurringTemplates`, `getUpcomingRecurring` in `queries.ts` — both query `recurringTemplates` table with Drizzle | DB queries present; no static fallback | FLOWING |
| `page.tsx` | `templates`, `upcoming`, `accounts`, `categories` | `Promise.all([getRecurringTemplates(...), getUpcomingRecurring(...), getAccounts(...), getCategories(...)])` | All four DB-backed queries | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for UI components (requires running browser and live DB). Server action logic verified by code inspection. Runnable checks for pure functions are covered by the existing core-finance test suite (162 tests passing per SUMMARY).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| REC-01 | 07-01, 07-02 | User can create a recurring template with account, category, type, amount, description, frequency, and start date | SATISFIED | `createRecurringTemplate` server action + `CreateRecurringDialog` with all required fields |
| REC-02 | 07-01, 07-02 | User can edit and delete recurring templates | SATISFIED | `updateRecurringTemplate` + `deleteRecurringTemplate` server actions; edit via pencil/dialog; delete via ConfirmDialog |
| REC-03 | 07-01, 07-02 | User can manually trigger "Gerar agora" to create transaction and advance nextDueDate | SATISFIED | `generateRecurringTransaction` with atomic dedup + `advanceByFrequency`; "Gerar agora" button in UI |
| REC-04 | 07-01, 07-02 | User can view a list of upcoming recurring transactions due in the next 30 days | SATISFIED | `getUpcomingRecurring` query + `/transactions/recurring` page; see design note below |
| REC-05 | 07-01, 07-02 | User can pause and reactivate a recurring template without losing generated transaction history | SATISFIED | `toggleRecurringActive` flips `isActive` only; generated transactions unaffected by FK ON DELETE SET NULL |

All five REC requirements tracked as Complete in REQUIREMENTS.md.

**No orphaned requirements:** All REC-01 through REC-05 are claimed in both plan frontmatter entries and verified above.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `recurring-template-list.tsx` line 100 | `upcoming.filter((t) => isOverdue(t.nextDueDate))` further filters 30-day upcoming to only overdue items in "Proximas a vencer" section | Info | Templates due 2-30 days from now are fetched but not shown in the dedicated upcoming section — only in the "Todas as recorrencias" table. REC-04 still satisfied because the full list is visible on the page. Design choice: the upcoming section is a "needs action now" prompt, not a forecast calendar. |

No blocking anti-patterns found. No TODO/FIXME/placeholder comments. No empty return stubs. No hardcoded empty data in rendering paths.

**CLAUDE.md 500-line limit:** All files comply — largest is `recurring-template-list.tsx` at 339 lines.

---

### Human Verification Required

#### 1. Template Creation and List Display

**Test:** Navigate to /transactions/recurring. Click "Nova Recorrencia". Fill in all fields (description, account, category, type, amount, frequency, start date). Submit.
**Expected:** Template immediately appears in "Todas as recorrencias" table with all correct values displayed; no page reload required.
**Why human:** Server revalidation and React state update on successful `createRecurringTemplate` requires a browser.

#### 2. Edit Mode Pre-fill and Update

**Test:** Click the pencil icon on an existing template. Verify all fields are pre-filled with current values. Change the description and save.
**Expected:** Dialog opens with current values; after save, the table row updates to the new description.
**Why human:** `useEffect` sync of form state from `editTemplate` prop requires browser execution.

#### 3. Delete With Confirmation and History Preservation

**Test:** Click the trash icon on a template that has previously generated transactions. Confirm in the dialog.
**Expected:** ConfirmDialog shows the message about preserving generated transactions. Template removed from list. Navigate to /transactions — the previously generated transactions still appear.
**Why human:** Cross-page persistence and confirmation dialog flow require browser and live DB.

#### 4. "Gerar agora" — Transaction Creation and Balance Update

**Test:** Create a template with a past start date (e.g., 10 days ago, monthly). Click "Gerar agora".
**Expected:** Toast shows the count of generated transactions. Navigate to /transactions — the generated transaction(s) appear. Navigate to /accounts — the account balance reflects the change. The template's "Proxima Data" in the table advances by one frequency period.
**Why human:** Atomic DB transaction, balance mutation, revalidation of multiple routes require live environment.

#### 5. Dedup Guard — No Duplicate on Second Click

**Test:** Immediately after step 4, click "Gerar agora" again on the same template (nextDueDate is now in the future).
**Expected:** Toast shows "Nenhuma transacao a gerar — proxima data no futuro." No new transaction is created.
**Why human:** Requires confirming DB state (unique index enforcement) via browser.

#### 6. Pause/Reactivate Without History Loss

**Test:** Click the Pause icon on a template. Verify status changes to "Pausado" and (if it was in the upcoming section) it disappears from "Proximas a vencer". Click the Play icon to reactivate.
**Expected:** Status returns to "Ativo"; `nextDueDate` is unchanged; template reappears in upcoming section if still due.
**Why human:** Server revalidation and status toggle visual feedback require browser.

#### 7. Sidebar Navigation

**Test:** Confirm "Recorrentes" link appears in the sidebar Cadastros section. Click it.
**Expected:** Navigates to /transactions/recurring; link is highlighted as active.
**Why human:** Active state CSS class requires browser rendering.

---

### Gaps Summary

No gaps found. All five success criteria are met by the implemented code:

1. Template creation with all required fields — `createRecurringTemplate` + `CreateRecurringDialog` — both present, substantive, and wired.
2. Edit and delete — `updateRecurringTemplate` + `deleteRecurringTemplate` + UI actions — fully wired.
3. "Gerar agora" with dedup and date advancement — `generateRecurringTransaction` atomically handles all three concerns via `onConflictDoNothing`, `advanceByFrequency`, and `db.transaction`.
4. 30-day upcoming view — `getUpcomingRecurring` query feeds the page; "Proximas a vencer" section shows overdue-only subset (info-level design choice, not a blocker).
5. Pause/reactivate without history loss — `toggleRecurringActive` touches only `isActive`; generated transactions preserved via FK semantics.

The only items requiring human attention are visual and functional end-to-end confirmations that cannot be verified by static code analysis.

---

_Verified: 2026-03-29T11:00:00Z_
_Verifier: Claude (gsd-verifier)_
