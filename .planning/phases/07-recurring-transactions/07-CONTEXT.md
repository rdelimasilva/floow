# Phase 7: Recurring Transactions - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can define recurring transaction templates and generate transactions on demand, eliminating repetitive manual entry for predictable expenses and income. Covers CRUD for recurring templates, an upcoming-due list, manual generation with duplicate guard, and pause/reactivation. The pure functions `advanceByFrequency()` and `getOverdueDates()` and the DB schema already exist from Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Recurring Templates CRUD
- Templates managed on a dedicated `/transactions/recurring` page — not a tab on /transactions
- Template list shows: description, account, category, type, amount, frequency, next due date, status (active/paused)
- Create template form as a dialog/modal (matching CreateRuleDialog pattern from Phase 6)

### Generation Flow
- User-triggered generation ("Gerar agora" button) — cron deferred to v2 (locked decision)
- Clicking "Gerar agora" creates the transaction AND advances nextDueDate atomically
- `(recurring_template_id, date)` unique constraint prevents duplicate generation (locked decision)
- Generated transactions update account balance using the existing inline `sql\`balance_cents + ${signedAmount}\`` pattern
- Auto-categorization rules apply to generated transactions when template has no category

### Upcoming Due List
- Section on /transactions/recurring showing templates due in next 30 days
- Sorted by next_due_date ASC (soonest first)
- Each row shows "Gerar agora" button when due date <= today

### Pause/Reactivate
- Toggle button on template row (active/paused state)
- Paused templates do not appear in "upcoming due" section
- Reactivating does NOT change nextDueDate — it picks up from where it left off
- Generated transaction history is preserved regardless of pause state

### Navigation
- Add "Recorrentes" nav item under "Financas" section in sidebar, after "Categorias"
- Link to `/transactions/recurring`

### Claude's Discretion
- Template list display format (table vs cards)
- Whether to show last generated date on template row
- Empty state message and illustration
- Whether "Gerar agora" should generate all overdue transactions at once or one at a time
- Confirmation dialog before generation (or immediate with toast)
- Whether to show a summary of generated transactions after bulk generation

### Deferred Ideas (OUT OF SCOPE)
- Automatic generation via cron (REC-06 — deferred to v2)
- Projected recurring on cash flow dashboard (REC-07 — deferred to v2)
- End date / max occurrences on templates

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `advanceByFrequency()` in `packages/core-finance/src/recurring.ts` — pure function for date advancement, fully tested
- `getOverdueDates()` in same file — returns all due dates up to reference date, fully tested
- `RecurringFrequency` type in same file — `'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'`
- `recurring_templates` SQL table in `00006_automation.sql` — complete with RLS, indexes, FK constraints
- `transactions.recurring_template_id` column added in same migration
- Unique index `uq_generated_transactions` on `(recurring_template_id, date)` for dedup
- Balance update pattern in `actions.ts` — `sql\`balance_cents + ${signedAmount}\`` inside db.transaction
- `createTransaction` pattern — Zod validation, auto-categorize, balance update, revalidatePath
- `matchCategory()` from `@floow/core-finance` — for auto-categorizing generated transactions

### Established Patterns
- Server actions in `apps/web/lib/finance/actions.ts` — `getOrgId()` + Drizzle queries + `revalidatePath()`
- FormData-based server actions
- Inline balance updates with `sql` template literals inside transactions
- `assertAccountOwnership()` helper for validating account access
- `getCategoryRules()` called outside db.transaction blocks
- Native `<dialog>` for modals (ConfirmDialog, CreateRuleDialog)
- `useToast()` for feedback
- `PageHeader` component for page titles

### Integration Points
- `packages/db/src/schema/automation.ts` — add `recurringTemplates` Drizzle table + types
- `packages/db/src/schema/finance.ts` — add `recurringTemplateId` field to transactions
- `apps/web/lib/finance/actions.ts` — add recurring template CRUD + generate actions
- `apps/web/lib/finance/queries.ts` — add recurring template queries
- `apps/web/components/layout/sidebar.tsx` — add "Recorrentes" nav item
- `apps/web/app/(app)/transactions/recurring/page.tsx` — new page

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the locked decisions. User delegated implementation details to Claude while locking core UX decisions (user-triggered generation, dedup constraint, pause preserves history).

</specifics>

<deferred>
## Deferred Ideas

- **REC-06**: Automatic generation via Supabase Edge Function cron job — deferred to v2
- **REC-07**: Projected recurring on cash flow dashboard — deferred to v2
- End date / max occurrences on templates — deferred to future

</deferred>

---

*Phase: 07-recurring-transactions*
*Context gathered: 2026-03-19*
