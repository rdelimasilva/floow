# Architecture Research

**Domain:** Financial automation — automatic transaction categorization and recurring transactions
**Researched:** 2026-03-18
**Confidence:** HIGH (based on direct codebase analysis)

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (RSC)                     │
├──────────────────────────────┬─────────────────────────────────┤
│  /transactions (existing)    │  /transactions/recurring (new)  │
│  /categories (existing)      │                                 │
├──────────────────────────────┴─────────────────────────────────┤
│                     Server Actions (lib/finance/)               │
│  actions.ts (existing)    +  categorization-actions.ts (new)   │
│                            +  recurring-actions.ts (new)        │
├──────────────────────────────────────────────────────────────────┤
│                    core-finance package (pure functions)         │
│  matchCategory() (new)    +  generateOccurrences() (new)        │
│  applyRules() (new)                                             │
├────────────────┬──────────────────────┬────────────────────────┤
│  @floow/db     │  packages/db/schema  │  Drizzle ORM           │
│  finance.ts    │  + category_rules    │  + recurring_templates │
│  (existing)    │    (new table)       │    (new table)         │
├────────────────┴──────────────────────┴────────────────────────┤
│              Supabase PostgreSQL + RLS                          │
│  transactions (existing)   categories (existing)               │
│  category_rules (new)      recurring_templates (new)           │
└────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Existing or New |
|-----------|----------------|-----------------|
| `category_rules` table | Stores per-org pattern → category mappings | NEW |
| `recurring_templates` table | Stores recurring transaction definitions with frequency/schedule | NEW |
| `matchCategory()` pure fn | Applies rules to a description string, returns best category match | NEW in core-finance |
| `applyRulesToTransaction()` pure fn | Wraps matchCategory for single transaction input | NEW in core-finance |
| `generateOccurrences()` pure fn | Given a template + date range, returns due transaction dates | NEW in core-finance |
| `categorization-actions.ts` | Server actions: CRUD for category_rules, bulk re-categorize | NEW in lib/finance/ |
| `recurring-actions.ts` | Server actions: CRUD for templates, generate due transactions | NEW in lib/finance/ |
| `queries.ts` | Add: getCategoryRules(), getRecurringTemplates() | MODIFIED |
| `finance.ts` (db schema) | Add Drizzle table definitions for new tables | MODIFIED |
| `00006_automation.sql` | Migration for new tables + RLS policies | NEW in supabase/migrations/ |
| `TransactionForm` | Hook into categorization: auto-suggest category on description blur | MODIFIED (optional enhancement) |
| `RecurringTemplateList` | UI for managing recurring templates | NEW component |
| `CategoryRuleList` | UI for managing auto-categorization rules | NEW component |

## Recommended Project Structure

New files only — existing structure unchanged:

```
packages/
├── db/
│   └── src/schema/
│       └── finance.ts            # ADD: categoryRules + recurringTemplates tables
├── core-finance/
│   └── src/
│       ├── categorization.ts     # NEW: matchCategory, applyRules (pure fns)
│       ├── recurring.ts          # NEW: generateOccurrences, nextOccurrence (pure fns)
│       └── index.ts              # ADD: export from new files

apps/web/
├── lib/finance/
│   ├── categorization-actions.ts  # NEW: createRule, updateRule, deleteRule, bulkRecategorize
│   ├── recurring-actions.ts       # NEW: createTemplate, updateTemplate, deleteTemplate, generateDue
│   └── queries.ts                 # ADD: getCategoryRules, getRecurringTemplates
├── components/finance/
│   ├── category-rule-list.tsx     # NEW: table of rules with inline edit/delete
│   ├── category-rule-form.tsx     # NEW: pattern + category selector form
│   ├── recurring-template-list.tsx # NEW: table of templates with status
│   └── recurring-template-form.tsx # NEW: template creation/edit form
└── app/(app)/
    ├── categories/
    │   └── page.tsx               # MODIFY: add rules tab/section
    └── transactions/
        └── recurring/
            └── page.tsx           # NEW: recurring templates management page

supabase/migrations/
└── 00006_automation.sql           # NEW: category_rules + recurring_templates + RLS
```

### Structure Rationale

- **`categorization.ts` in core-finance:** Rule matching is pure computation (no DB). Lives alongside import parsing as another transaction processing step. Reusable by Edge Functions if needed.
- **`recurring.ts` in core-finance:** Date arithmetic for occurrence generation is pure. TDD-friendly. Mirrors how `computeSnapshot` and `simulateRetirement` are isolated.
- **`categorization-actions.ts` separate from `actions.ts`:** Avoids bloating the existing `actions.ts` (already 500 LOC). Domain-scoped separation matches existing `import-actions.ts` pattern.
- **`categories/` page gets the rules section:** Category rules are semantically part of category management, not transactions. No new top-level route needed.
- **`transactions/recurring/` as new route:** Recurring templates are distinct from regular transactions and need their own management surface.

## Architectural Patterns

### Pattern 1: Rule-Based Categorization (description matching)

**What:** An ordered list of per-org rules, each with a `pattern` (substring or regex) and a `categoryId`. When a transaction is created or imported, rules are evaluated in priority order; first match wins.

**When to use:** Applied in three contexts:
1. On manual transaction creation (suggestion, not forced)
2. On import (applied automatically, user can override)
3. On bulk re-categorize action (retroactive, user-triggered)

**Trade-offs:** Simple substring matching covers 90% of real-world needs. Regex adds power but complicates UI. Recommend substring + optional case-insensitive flag as v1.

**Example:**
```typescript
// packages/core-finance/src/categorization.ts

export interface CategoryRule {
  id: string
  pattern: string        // substring to match in description
  categoryId: string
  priority: number       // lower = higher priority
  isRegex: boolean
}

export function matchCategory(
  description: string,
  rules: CategoryRule[]
): string | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of sorted) {
    const matches = rule.isRegex
      ? new RegExp(rule.pattern, 'i').test(description)
      : description.toLowerCase().includes(rule.pattern.toLowerCase())
    if (matches) return rule.categoryId
  }
  return null
}
```

### Pattern 2: Recurring Template + On-Demand Generation

**What:** A `recurring_templates` table stores the definition (amount, description, category, account, frequency, next_due_date, end_date). Transactions are generated on-demand when the user visits the recurring page or via a scheduled process, not automatically in the background.

**When to use:** User explicitly triggers "Generate due transactions" or the page shows a banner "3 transactions due" with a one-click generate button.

**Trade-offs:** On-demand generation is simpler to implement and avoids background job infrastructure. The downside is transactions don't appear until the user takes action — acceptable for v1.1 since Supabase Edge Functions (cron) would be needed for fully automatic generation.

**Example:**
```typescript
// packages/core-finance/src/recurring.ts

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringTemplate {
  id: string
  frequency: Frequency
  nextDueDate: Date
  endDate: Date | null
  amountCents: number
  description: string
  categoryId: string | null
  accountId: string
}

export function getOverdueDates(
  template: RecurringTemplate,
  asOf: Date
): Date[] {
  const dates: Date[] = []
  let cursor = new Date(template.nextDueDate)
  while (cursor <= asOf && (!template.endDate || cursor <= template.endDate)) {
    dates.push(new Date(cursor))
    cursor = advanceByFrequency(cursor, template.frequency)
  }
  return dates
}
```

### Pattern 3: Import-Time Auto-Categorization

**What:** When `importSelectedTransactions` or `importTransactions` is called, the server action fetches the org's category rules once, then applies `matchCategory()` to each transaction before insert.

**When to use:** Every import. Zero user interaction required — improves UX by pre-filling categories that the user would have to assign manually.

**Trade-offs:** Requires one extra DB query per import (fetch rules). Since import is a rare, user-triggered action this is acceptable. Rules query should use `getDb()` directly (not React `cache()`) since it's inside a server action.

**Example (modification to existing import-actions.ts):**
```typescript
// Inside importSelectedTransactions — MODIFIED section
const rules = await db.select().from(categoryRules)
  .where(eq(categoryRules.orgId, orgId))
  .orderBy(categoryRules.priority)

const rows = selected.map((tx) => ({
  ...existingFields,
  categoryId: matchCategory(tx.description, rules) ?? null,
}))
```

## Data Flow

### Auto-Categorization on Import

```
User uploads file
    ↓
previewImport (existing) — no change
    ↓
importSelectedTransactions (MODIFIED)
    ↓
fetch org's category_rules (NEW query)
    ↓
matchCategory(description, rules) → categoryId | null   [pure fn]
    ↓
insert transactions with categoryId pre-filled
    ↓
revalidatePath('/transactions')
```

### Recurring Template Generation

```
User visits /transactions/recurring
    ↓
RSC: getRecurringTemplates(orgId) — fetch templates
    ↓
RSC: compute overdue count via getOverdueDates() [pure fn]
    ↓
Render: show "N transactions due" banner
    ↓
User clicks "Generate"
    ↓
generateDueTransactions() server action
    ↓
For each overdue template:
  - createTransaction() (reuse existing action)
  - update template.nextDueDate
    ↓
revalidatePath('/transactions')
revalidatePath('/transactions/recurring')
```

### Rule Management

```
User opens /categories (existing page, new tab)
    ↓
RSC: getCategories() + getCategoryRules() [new query]
    ↓
CategoryRuleList component (new)
    ↓
User creates/edits/deletes rule
    ↓
createRule / updateRule / deleteRule server actions (new)
    ↓
revalidatePath('/categories')
```

### Key Data Flows

1. **Rule application is always synchronous:** `matchCategory()` is called in-process within the server action. No async. No queue.
2. **Recurring generation reuses `createTransaction()`:** The existing atomic balance update + transaction insert is reused by wrapping it inside `generateDueTransactions`. No duplicated balance logic.
3. **Template `nextDueDate` advances after generation:** After inserting transactions, the template's `nextDueDate` is updated to `advanceByFrequency(latestGeneratedDate, frequency)`. This is the only state that persists between generation runs.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | On-demand generation is fine. Rules evaluated in-process. |
| 1k-100k users | Add `pg_cron` or Supabase Edge Function cron for background recurring generation. Add index on `category_rules(org_id, priority)`. |
| 100k+ users | Cache rules in Redis/Upstash per org (TTL ~5min). Background job queue for bulk re-categorization. |

### Scaling Priorities

1. **First bottleneck:** Rule matching on large imports (500+ transactions). Mitigate: fetch rules once per import, not per transaction. Already covered by pattern above.
2. **Second bottleneck:** Recurring generation for orgs with 100+ templates. Mitigate: batch insert instead of loop. Address in v2 if needed.

## Anti-Patterns

### Anti-Pattern 1: Auto-apply categorization without user override

**What people do:** Silently overwrite a user-assigned category when running bulk re-categorize, or force a category during import that the user cannot override.

**Why it's wrong:** Users who manually set a category will lose their work. Destroys trust in the system.

**Do this instead:** During import, auto-fill only if `categoryId IS NULL`. During bulk re-categorize, add a "skip already categorized" checkbox defaulted to ON.

### Anti-Pattern 2: Background auto-generation of recurring transactions

**What people do:** Use a cron job to insert recurring transactions automatically without user confirmation.

**Why it's wrong:** Transactions may be inserted for wrong amounts or on wrong accounts. User finds surprise transactions they didn't expect. Hard to debug.

**Do this instead:** Show a "N transactions due" notice and require user confirmation to generate. Keep generation fully user-triggered for v1.1.

### Anti-Pattern 3: Storing regex patterns from user input without sanitization

**What people do:** Accept arbitrary regex from users, run `new RegExp(input)` directly in the matching loop.

**Why it's wrong:** ReDoS (regex denial of service) — a malicious or malformed pattern can hang the Node.js process.

**Do this instead:** For v1.1, support substring matching only. If regex is needed, validate with a timeout wrapper or a safe-regex library before saving the rule.

### Anti-Pattern 4: Implementing a separate "apply rules" service layer

**What people do:** Add a `CategorizationService` class that wraps the DB query and pure function call.

**Why it's wrong:** The existing codebase uses the pure function + thin DB wrapper pattern deliberately. Adding service layers for two small features breaks the established architecture with no benefit.

**Do this instead:** Follow the existing pattern: pure function in `core-finance`, DB call inline in the server action.

## Integration Points

### Existing Code Modified

| File | Change | Why |
|------|--------|-----|
| `packages/db/src/schema/finance.ts` | Add `categoryRules` and `recurringTemplates` table definitions + exported types | New tables need Drizzle schema |
| `packages/db/src/index.ts` | Auto-exports new tables via `export * from './schema/finance'` | No change needed (wildcard export already in place) |
| `apps/web/lib/finance/queries.ts` | Add `getCategoryRules()` and `getRecurringTemplates()` | New query functions |
| `apps/web/lib/finance/import-actions.ts` | Apply rules inside `importTransactions` and `importSelectedTransactions` | Auto-categorize on import |
| `packages/core-finance/src/index.ts` | Add `export * from './categorization'` and `export * from './recurring'` | Expose new pure functions |

### New Code Added

| File | Purpose |
|------|---------|
| `packages/core-finance/src/categorization.ts` | `matchCategory()`, `CategoryRule` type |
| `packages/core-finance/src/recurring.ts` | `getOverdueDates()`, `advanceByFrequency()`, `RecurringTemplate` type, `Frequency` enum |
| `apps/web/lib/finance/categorization-actions.ts` | `createRule`, `updateRule`, `deleteRule`, `bulkRecategorize` |
| `apps/web/lib/finance/recurring-actions.ts` | `createRecurringTemplate`, `updateRecurringTemplate`, `deleteRecurringTemplate`, `generateDueTransactions` |
| `apps/web/components/finance/category-rule-list.tsx` | Rules table UI |
| `apps/web/components/finance/category-rule-form.tsx` | Rule creation/edit form |
| `apps/web/components/finance/recurring-template-list.tsx` | Templates table with overdue badge |
| `apps/web/components/finance/recurring-template-form.tsx` | Template form with frequency selector |
| `apps/web/app/(app)/transactions/recurring/page.tsx` | Recurring management page (RSC) |
| `supabase/migrations/00006_automation.sql` | DDL for new tables + RLS policies |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `core-finance` ↔ `lib/finance/` | Direct import of pure functions | Same as existing pattern (computeSnapshot, parseOFXFile, etc.) |
| `lib/finance/` ↔ `@floow/db` | Direct Drizzle queries via `getDb()` | Same as existing pattern |
| `categorization-actions.ts` ↔ `actions.ts` | No direct coupling — both call `getOrgId()` independently | Rules CRUD is fully separate from transaction CRUD |
| `recurring-actions.ts` ↔ `actions.ts` | `generateDueTransactions` calls the same DB insert pattern as `createTransaction` but inlined (not calling the server action directly — server actions are not composable) | Atomic balance update must be duplicated or extracted to a shared helper |

### RLS Considerations

Both new tables follow the established RLS pattern exactly:

```sql
-- category_rules: members can select/insert/update/delete their org's rules
CREATE POLICY "category_rules: members can select"
  ON public.category_rules FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.get_user_org_ids()));
```

The `recurring_templates` table similarly: all rows scoped by `org_id`, same `get_user_org_ids()` function used by all other tables.

## Build Order

This order respects dependencies — each step can be built and tested independently before the next:

1. **DB schema + migration** (`finance.ts` additions + `00006_automation.sql`) — foundation everything else depends on
2. **Pure functions** (`categorization.ts` + `recurring.ts` + tests) — no external dependencies, TDD first
3. **Query functions** (`getCategoryRules`, `getRecurringTemplates` in `queries.ts`) — depend on step 1
4. **Categorization server actions** (`categorization-actions.ts`) — depend on steps 1-3
5. **Import integration** (modify `import-actions.ts` to apply rules) — depends on step 4
6. **Categorization UI** (`category-rule-list`, `category-rule-form`, categories page update) — depends on step 4
7. **Recurring server actions** (`recurring-actions.ts`) — depends on steps 1-3
8. **Recurring UI** (`recurring-template-*` components + new page) — depends on step 7

Steps 4-6 and steps 7-8 are independent streams once the DB and pure functions exist (steps 1-3). They can be built in parallel.

## Sources

- Direct codebase analysis: `packages/db/src/schema/finance.ts`, `apps/web/lib/finance/actions.ts`, `apps/web/lib/finance/import-actions.ts`, `apps/web/lib/finance/queries.ts`
- Established patterns observed: pure function + thin DB wrapper, server actions over API routes, `getOrgId()` + `getDb()` in every action, `revalidatePath` for cache invalidation
- RLS pattern from `supabase/migrations/00002_finance.sql`
- Project constraints from `.planning/PROJECT.md`

---
*Architecture research for: Floow v1.1 — automatic categorization + recurring transactions*
*Researched: 2026-03-18*
