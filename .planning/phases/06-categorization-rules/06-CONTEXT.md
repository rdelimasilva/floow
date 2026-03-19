# Phase 6: Categorization Rules - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can define rules that automatically assign categories to transactions, reducing manual categorization work. Covers CRUD for rules, auto-application on import/create, a "categorize all like this" shortcut from transaction rows, and retroactive bulk application with impact preview. The pure function `matchCategory()` and DB schema already exist from Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Rules Management UI
- Rules live as a **tab on /categories page** ("Regras" tab alongside existing category list) — uses shadcn Tabs component
- Up/down arrow buttons for reordering priority (no drag-and-drop library needed)
- Rule list layout and enable/disable toggle style: **Claude's Discretion**

### Rule Creation Flow
- "Categorizar todas como esta" button on transaction rows opens a **modal/dialog** with pre-filled form
- Default match type: **contains** (catches description variations automatically)
- matchValue pre-filled with the **full transaction description** — user trims variable parts (dates, codes) manually
- Category pre-filled from the transaction's current category
- Whether to include a "test/preview matching transactions" feature when creating from rules tab: **Claude's Discretion**

### Retroactive Application
- "Aplicar" action available in **both** the rule row (button) and the rule edit modal
- Impact preview (showing "X transações serão afetadas") before confirming — exact UX (simple count vs transaction list): **Claude's Discretion**
- Scope of retroactive application (all uncategorized vs date-filtered): **Claude's Discretion**
- Post-application feedback (toast vs dialog): **Claude's Discretion**

### Import/Create Hooks
- **Visual indicator** (e.g., ⚡ or "auto" badge) on transactions that were auto-categorized — user can see which categories were set by rules vs manually
- Always preserve manual categories — once category_id is set, rules never overwrite it (consistent with Phase 5 `category_id IS NULL` guard)
- Whether to show predicted categories in import preview: **Claude's Discretion**
- Whether to auto-fill category in the manual transaction form as user types description: **Claude's Discretion**

### Claude's Discretion
- Rule list display format (table rows vs cards)
- Toggle switch vs checkbox for enable/disable
- Test/preview feature during rule creation from rules tab
- Retroactive impact preview detail level
- Retroactive scope configurability
- Post-retroactive feedback style
- Import preview category display
- Transaction form auto-fill behavior

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `matchCategory()` in `packages/core-finance/src/categorization.ts` — pure function for rule matching, already tested
- `CategoryRule` interface and `MatchType` type in same file — reuse for server actions and UI
- `CategoryList` component (`apps/web/components/finance/category-list.tsx`) — inline edit pattern, ConfirmDialog usage, toast pattern
- `TransactionList` component (`apps/web/components/finance/transaction-list.tsx`) — row action pattern, edit state management
- `ConfirmDialog` component (`apps/web/components/ui/confirm-dialog.tsx`) — for retroactive application confirmation
- `useToast` hook (`apps/web/components/ui/toast.tsx`) — for success/error feedback
- `Tabs` component (`apps/web/components/ui/tabs.tsx`) — for categories/rules tab switcher
- `Table` component (`apps/web/components/ui/table.tsx`) — for rule list display

### Established Patterns
- Server actions in `apps/web/lib/finance/actions.ts` — `getOrgId()` + Drizzle queries + `revalidatePath()`
- FormData-based server actions with Zod validation
- Inline editing pattern (editingId state, startEdit, handleUpdate, resetForm)
- Integer cents for monetary values
- `category_rules` table already created in migration `00006_automation.sql` with RLS policies

### Integration Points
- `/categories` page (`apps/web/app/(app)/categories/page.tsx`) — add Tabs wrapper, rules tab
- `apps/web/lib/finance/actions.ts` — add rule CRUD server actions and `createTransaction` hook
- `apps/web/lib/finance/import-actions.ts` — add auto-categorization during `confirmImport`
- `apps/web/lib/finance/queries.ts` — add `getCategoryRules(orgId)` query
- `transactions` table — may need `is_auto_categorized` boolean column for visual indicator

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User delegated most implementation details to Claude while locking down the core UX decisions (tab location, modal creation, arrow reorder, visual indicator).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-categorization-rules*
*Context gathered: 2026-03-18*
