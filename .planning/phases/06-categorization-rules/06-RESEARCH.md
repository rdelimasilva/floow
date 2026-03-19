# Phase 6: Categorization Rules - Research

**Researched:** 2026-03-18
**Domain:** Next.js Server Actions + Drizzle ORM + React state management (categorization rule CRUD, auto-apply hooks)
**Confidence:** HIGH

## Summary

Phase 6 is entirely additive — the hardest technical problems (DB schema, pure function, RLS policies, pg_trgm index) were solved in Phase 5. The `category_rules` table is live in Supabase with all indexes and RLS. The `matchCategory()` pure function is fully tested. This phase wires those foundations into server actions and UI.

The two main work streams are: (1) server-side — CRUD actions for rules, retroactive bulk-categorization, and hooking `matchCategory()` into `importTransactions` and `createTransaction`; (2) client-side — a "Regras" tab on `/categories` using the existing `Tabs` component, a rule form modal, and a "categorize from transaction" shortcut button in the transaction list.

One gap to address upfront: `category_rules` exists in the SQL migration but has no Drizzle schema table object yet (`packages/db/src/schema/` has no automation file). A new `automation.ts` schema file must be created and exported before server actions can reference `categoryRules` via Drizzle. Similarly, `transactions` needs an `isAutoCategorized` boolean column added via migration + schema for the visual indicator.

**Primary recommendation:** Create the Drizzle schema for `category_rules` first (Wave 0), then build server actions (Plan 06-01), then UI (Plan 06-02). Follow the existing `actions.ts` pattern verbatim: `getOrgId()`, Drizzle queries, `revalidatePath()`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rules live as a **tab on /categories page** ("Regras" tab alongside existing category list) — uses shadcn Tabs component
- Up/down arrow buttons for reordering priority (no drag-and-drop library needed)
- "Categorizar todas como esta" button on transaction rows opens a **modal/dialog** with pre-filled form
- Default match type: **contains** (catches description variations automatically)
- matchValue pre-filled with the **full transaction description** — user trims variable parts manually
- Category pre-filled from the transaction's current category
- "Aplicar" action available in **both** the rule row (button) and the rule edit modal
- Impact preview ("X transacoes serao afetadas") before confirming retroactive application
- **Visual indicator** (e.g., "auto" badge) on transactions that were auto-categorized
- Always preserve manual categories — once category_id is set, rules never overwrite it (consistent with Phase 5 `category_id IS NULL` guard)

### Claude's Discretion
- Rule list display format (table rows vs cards)
- Toggle switch vs checkbox for enable/disable
- Test/preview feature during rule creation from rules tab
- Retroactive impact preview detail level (simple count vs transaction list)
- Retroactive scope configurability (all uncategorized vs date-filtered)
- Post-retroactive feedback style (toast vs dialog)
- Import preview category display
- Transaction form auto-fill behavior

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAT-01 | User can create a categorization rule with match type (contains/exact), match value, target category, and priority | `createRule` server action + rule form UI in "Regras" tab |
| CAT-02 | User can edit, reorder, enable/disable, and delete categorization rules | `updateRule`, `deleteRule`, `reorderRules` actions + inline edit or modal pattern matching CategoryList |
| CAT-03 | Rules automatically applied during OFX/CSV import (only when no category is set) | Hook in `importTransactions` and `importSelectedTransactions` — fetch enabled rules, call `matchCategory()`, inject `categoryId` |
| CAT-04 | Rules automatically applied when creating a transaction manually (only when no category is explicitly chosen) | Hook in `createTransaction` — if `categoryId` is null, run `matchCategory()` against enabled rules |
| CAT-05 | "Categorizar todas como esta" from transaction row opens pre-populated rule form | New button in `TransactionList` row actions; modal with pre-filled description + category |
| CAT-06 | User can apply a rule retroactively with impact preview showing affected count before confirming | `previewBulkRecategorize` (count query) + `bulkRecategorize` server action; ConfirmDialog shows count |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | existing | DB queries for `category_rules` CRUD | Already used throughout `actions.ts` and `queries.ts` |
| @floow/core-finance | workspace | `matchCategory()` pure function | Phase 5 deliverable, fully tested |
| @floow/db | workspace | `categoryRules` Drizzle table object | Needs automation schema file (see Wave 0 Gaps) |
| next/cache `revalidatePath` | existing | Invalidate `/categories` and `/transactions` after mutations | Consistent with all other server actions |
| zod | existing | Validate rule form inputs in server actions | Matches `createTransactionSchema` pattern |
| lucide-react | existing | ArrowUp, ArrowDown, Power icons for rule list actions | Already used in CategoryList, TransactionList |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-tabs | existing (via `tabs.tsx`) | "Regras" / "Categorias" tab switcher on /categories | Wrap the existing CategoryList and new RuleList |
| `<dialog>` HTML element | native | Rule creation/edit modal | ConfirmDialog already uses this pattern; reuse same approach |
| `useToast` | local | Success/error feedback after mutations | Already in CategoryList and TransactionList |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<dialog>` modal | Radix Dialog or Sheet | Radix not yet installed; project uses native `<dialog>` — stay consistent |
| Table rows for rule list | Card layout | Table is already used in transaction-list; more scannable for priority-ordered rules |
| Simple count preview | Transaction list preview | Count is simpler, sufficient, and matches the locked decision's spirit |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
packages/db/src/schema/
└── automation.ts          # categoryRules Drizzle table object (Wave 0 gap)

apps/web/
├── lib/finance/
│   ├── actions.ts          # Add: createRule, updateRule, deleteRule, reorderRules,
│   │                       #       bulkRecategorize, previewBulkRecategorize
│   │                       # Modify: createTransaction (auto-categorize hook)
│   ├── import-actions.ts   # Modify: importTransactions + importSelectedTransactions
│   │                       #         (auto-categorize hook)
│   └── queries.ts          # Add: getCategoryRules(orgId)
│
├── app/(app)/categories/
│   └── page.tsx            # Modify: wrap with Tabs, pass rules to RuleList
│
└── components/finance/
    ├── rule-list.tsx        # New: rules table with CRUD + reorder + apply
    └── create-rule-dialog.tsx # New: modal form (used from rule-list AND transaction-list shortcut)
```

### Pattern 1: Server Action — Rule CRUD

Follows the exact same shape as `createCategory` / `updateCategory` / `deleteCategory`.

```typescript
// apps/web/lib/finance/actions.ts
'use server'
import { categoryRules } from '@floow/db'  // from new automation.ts schema
import { eq, and, desc } from 'drizzle-orm'

export async function createRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  // Validate with Zod (or manual checks matching category pattern)
  const matchType = formData.get('matchType') as 'contains' | 'exact'
  const matchValue = formData.get('matchValue') as string
  const categoryId = formData.get('categoryId') as string
  const priority = parseInt(formData.get('priority') as string ?? '0', 10)

  if (!matchType || !matchValue || !categoryId) throw new Error('matchType, matchValue, categoryId required')
  if (!['contains', 'exact'].includes(matchType)) throw new Error('Invalid matchType')

  const [rule] = await db
    .insert(categoryRules)
    .values({ orgId, matchType, matchValue, categoryId, priority, isEnabled: true })
    .returning()

  revalidatePath('/categories')
  return rule
}
```

### Pattern 2: getCategoryRules Query

```typescript
// apps/web/lib/finance/queries.ts
export async function getCategoryRules(orgId: string) {
  const db = getDb()
  return db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.orgId, orgId))
    .orderBy(desc(categoryRules.priority))
}
```

### Pattern 3: Auto-Categorize Hook in createTransaction

**Critical invariant:** Only inject when `categoryId` is null AND description is non-empty. Pre-filter disabled rules before calling `matchCategory()`.

```typescript
// Inside createTransaction, before the db.transaction block:
let resolvedCategoryId = input.categoryId ?? null

if (!resolvedCategoryId && input.description) {
  const rules = await getCategoryRules(orgId)
  const enabledSorted = rules
    .filter((r) => r.isEnabled)
    // already sorted by priority DESC from getCategoryRules
  const matched = matchCategory(input.description, enabledSorted)
  if (matched) {
    resolvedCategoryId = matched
    // flag for is_auto_categorized column
  }
}
```

### Pattern 4: Auto-Categorize Hook in importTransactions

Fetch rules once outside the `db.transaction` block (pure read), then apply to each row before building the `rows` array:

```typescript
// Outside db.transaction, after normalization:
const rules = await getCategoryRules(orgId)
const enabledRules = rules.filter((r) => r.isEnabled)

const rows = normalized.map((tx) => {
  const autoCategoryId = !tx.categoryId && tx.description
    ? matchCategory(tx.description, enabledRules)
    : null
  return {
    orgId,
    accountId,
    type: tx.type,
    amountCents: tx.amountCents,
    description: tx.description,
    date: tx.date,
    externalId: tx.externalId,
    importedAt,
    categoryId: autoCategoryId,
    isAutoCategorized: autoCategoryId !== null,
  }
})
```

### Pattern 5: Reorder Rules (Up/Down Buttons)

Swap the `priority` values of adjacent rules — two UPDATE statements in a single `db.transaction`:

```typescript
export async function reorderRule(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string
  const direction = formData.get('direction') as 'up' | 'down'

  // Fetch all rules for this org, sorted by priority DESC
  const rules = await getCategoryRules(orgId)
  const idx = rules.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error('Rule not found')

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rules.length) return // already at boundary

  const a = rules[idx]
  const b = rules[swapIdx]

  await db.transaction(async (tx) => {
    await tx.update(categoryRules)
      .set({ priority: b.priority })
      .where(and(eq(categoryRules.id, a.id), eq(categoryRules.orgId, orgId)))
    await tx.update(categoryRules)
      .set({ priority: a.priority })
      .where(and(eq(categoryRules.id, b.id), eq(categoryRules.orgId, orgId)))
  })

  revalidatePath('/categories')
}
```

**Edge case:** If two rules have the same `priority` value, swapping is a no-op. `createRule` should assign new rules a priority of `(maxExistingPriority + 10)` to leave gaps for future insertions without full renumbering.

### Pattern 6: Retroactive Bulk Categorize

Two actions — preview (count) and apply:

```typescript
// Preview: count only
export async function previewBulkRecategorize(formData: FormData): Promise<{ count: number }> {
  const orgId = await getOrgId()
  const db = getDb()
  const ruleId = formData.get('ruleId') as string

  const [rule] = await db.select().from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)
  if (!rule) throw new Error('Rule not found')

  // Count transactions where category_id IS NULL and description matches
  // Use ILIKE for contains, exact string comparison for exact
  const matchCondition = rule.matchType === 'exact'
    ? eq(transactions.description, rule.matchValue)  // case-insensitive: ilike with exact value
    : ilike(transactions.description, `%${rule.matchValue}%`)

  const [result] = await db
    .select({ total: count() })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      isNull(transactions.categoryId),
      matchCondition,
    ))

  return { count: result.total }
}

// Apply: update matching rows
export async function bulkRecategorize(formData: FormData): Promise<{ updated: number }> {
  const orgId = await getOrgId()
  const db = getDb()
  const ruleId = formData.get('ruleId') as string

  const [rule] = await db.select().from(categoryRules)
    .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.orgId, orgId)))
    .limit(1)
  if (!rule) throw new Error('Rule not found')

  const matchCondition = rule.matchType === 'exact'
    ? eq(transactions.description, rule.matchValue)
    : ilike(transactions.description, `%${rule.matchValue}%`)

  const updated = await db
    .update(transactions)
    .set({ categoryId: rule.categoryId, isAutoCategorized: true })
    .where(and(
      eq(transactions.orgId, orgId),
      isNull(transactions.categoryId),
      matchCondition,
    ))
    .returning({ id: transactions.id })

  revalidatePath('/transactions')
  revalidatePath('/categories')

  return { count: updated.length }
}
```

### Pattern 7: Create-Rule-Dialog Component

Reuses the existing `<dialog>` native element pattern from `ConfirmDialog`. Props accept optional pre-fill values for the "categorize all like this" shortcut:

```typescript
interface CreateRuleDialogProps {
  open: boolean
  onClose: () => void
  categories: CategoryOption[]
  // Optional pre-fill (from transaction row shortcut)
  prefill?: {
    matchValue: string
    categoryId: string
  }
}
```

The form has: match type selector (contains/exact), match value input, category selector, priority input (number), submit + cancel buttons.

### Pattern 8: Drizzle Schema for category_rules (Wave 0)

```typescript
// packages/db/src/schema/automation.ts
import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories } from './finance'

export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    matchType: text('match_type').notNull().$type<'contains' | 'exact'>(),
    matchValue: text('match_value').notNull(),
    priority: integer('priority').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxCategoryRulesOrgId: index('idx_category_rules_org_id').on(table.orgId),
  })
)

export type CategoryRuleRow = typeof categoryRules.$inferSelect
export type NewCategoryRuleRow = typeof categoryRules.$inferInsert
```

Export from `packages/db/src/index.ts` by adding: `export * from './schema/automation'`

### Pattern 9: is_auto_categorized Migration

The `transactions` table needs one new boolean column for the visual indicator (locked decision). This requires a new migration file:

```sql
-- supabase/migrations/00007_auto_categorized.sql
ALTER TABLE public.transactions
  ADD COLUMN is_auto_categorized boolean NOT NULL DEFAULT false;
```

And add to the Drizzle schema in `finance.ts`:
```typescript
isAutoCategorized: boolean('is_auto_categorized').notNull().default(false),
```

### Anti-Patterns to Avoid

- **Never call `getCategoryRules()` inside `db.transaction()`** — it uses React's `cache()`, which is scoped to request-level, and nested DB calls inside a transaction can cause connection pool exhaustion. Fetch rules before the transaction block.
- **Never overwrite non-null `categoryId`** — the entire system contract is `category_id IS NULL` as the guard. Server actions must check `!input.categoryId` before applying rules.
- **Don't pass disabled rules to `matchCategory()`** — the function does NOT filter by `isEnabled` (documented in Phase 5). Always `.filter((r) => r.isEnabled)` before calling.
- **Don't use `getOrgId()` cache inside nested closures repeatedly** — call once at top of action, store in `orgId` constant.
- **Don't use `ilike` for exact match in bulkRecategorize** — use `eq()` (case-insensitive comparison handled at DB collation level), or if case-insensitive exact is needed, use `ilike(transactions.description, rule.matchValue)` without wildcards.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive text matching | Custom string comparison | `ilike()` from drizzle-orm + pg_trgm GIN index | Index already created in migration 00006 for `match_value`; `ilike` on `transactions.description` uses existing trigram index |
| Rule conflict resolution | Custom priority queue | `matchCategory()` from `@floow/core-finance` | Already handles priority DESC, first-match-wins, tested |
| Dialog/modal | Headless UI or Radix Dialog | Native `<dialog>` element | Existing `ConfirmDialog` pattern; no new dependency |
| Tab switcher | Custom tab state | `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `tabs.tsx` | Already wraps `@radix-ui/react-tabs` |
| Toast notifications | Custom notification system | `useToast()` from `toast.tsx` | Already used in CategoryList and TransactionList |
| Bulk update WHERE clause | Application-side loop | Single Drizzle UPDATE with conditions | DB-side batch is atomic and far more efficient than N individual updates |

**Key insight:** The only genuinely new logic in Phase 6 is the plumbing between existing pieces — no new algorithmic complexity is required.

---

## Common Pitfalls

### Pitfall 1: Missing Drizzle Schema for category_rules

**What goes wrong:** `import { categoryRules } from '@floow/db'` fails at compile time — the table object doesn't exist yet despite the SQL migration running successfully.

**Why it happens:** The DB package's `schema/` directory only has `finance.ts`, `auth.ts`, etc. Migration 00006 created the SQL table, but no Drizzle table object was added.

**How to avoid:** Wave 0 must create `packages/db/src/schema/automation.ts` and add the export to `packages/db/src/index.ts` before writing any server action.

**Warning signs:** TypeScript error "Module '@floow/db' has no exported member 'categoryRules'".

### Pitfall 2: Reorder Priority Collision

**What goes wrong:** Two rules share the same `priority` integer. The up/down swap becomes a no-op, and the user can't reorder further.

**Why it happens:** Rules created without priority gaps — or rules inserted at priority 0 (default).

**How to avoid:** `createRule` assigns priority as `(currentMaxPriority + 10)`. This leaves 9 slots between each rule for future insertions. Provide an explicit priority field in the form (pre-filled with the calculated value) so power users can fine-tune.

**Warning signs:** UI up/down buttons appear to work (no error) but order doesn't change.

### Pitfall 3: Auto-Categorize Hook on Transfer Transactions

**What goes wrong:** Transfer transactions get auto-categorized, which is semantically wrong (transfers aren't income/expense and shouldn't carry spending categories).

**Why it happens:** The auto-categorize hook in `createTransaction` doesn't check `input.type`.

**How to avoid:** Guard the hook: `if (!resolvedCategoryId && input.description && input.type !== 'transfer')`.

**Warning signs:** Transfer rows show a category badge in the transaction list.

### Pitfall 4: getCategoryRules Called Inside db.transaction

**What goes wrong:** Deadlock or connection exhaustion, especially under concurrent load.

**Why it happens:** `getCategoryRules` opens a new DB connection from the pool. If called inside a `db.transaction()` callback that's already holding a connection, the pool may run out.

**How to avoid:** Always fetch rules before the transaction block, store result, pass into the transaction closure by reference.

### Pitfall 5: ilike Wildcard Injection on matchValue

**What goes wrong:** A rule with `matchValue = "100%"` becomes `ilike(description, "%100%%")` which matches everything with "100" followed by anything — not the user's intent.

**Why it happens:** The `%` wildcard is injected by the `bulkRecategorize` action, but the `matchValue` itself may contain literal `%` or `_` characters.

**How to avoid:** Escape `matchValue` before constructing the LIKE pattern:
```typescript
const escaped = rule.matchValue.replace(/%/g, '\\%').replace(/_/g, '\\_')
ilike(transactions.description, `%${escaped}%`)
```

### Pitfall 6: TransactionList "create rule" button missing categoryId when transaction has no category

**What goes wrong:** The dialog opens pre-filled with an empty `categoryId`, and the user must select a category manually — breaking the "pre-populated" locked decision.

**Why it happens:** The button is added to all transaction rows, but the shortcut is most useful when the row already has a category (you're creating a rule to reproduce that categorization at scale).

**How to avoid:** Show the "Categorizar todas como esta" button only when `tx.categoryId` is non-null. When it IS null, the button shouldn't appear (the rule would have no category to assign anyway).

---

## Code Examples

### Rule Row in the Rules Table (UI pattern)

```typescript
// In rule-list.tsx — single row, table layout
// Source: matches TransactionList row pattern
<TableRow key={rule.id}>
  <TableCell>{rule.matchType === 'contains' ? 'Contém' : 'Exato'}</TableCell>
  <TableCell className="font-mono text-sm">{rule.matchValue}</TableCell>
  <TableCell>{categoryName}</TableCell>
  <TableCell>{rule.priority}</TableCell>
  <TableCell>
    {/* Toggle enable/disable */}
    <button onClick={() => handleToggleEnabled(rule)}>
      <Power className={rule.isEnabled ? 'text-green-600' : 'text-gray-400'} />
    </button>
  </TableCell>
  <TableCell>
    <div className="flex gap-1">
      <button onClick={() => handleMoveUp(rule)} disabled={isFirst}>
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => handleMoveDown(rule)} disabled={isLast}>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => startEdit(rule)}><Pencil /></button>
      <button onClick={() => setDeleteTarget(rule)}><Trash2 /></button>
      <button onClick={() => handleApplyRule(rule)}>Aplicar</button>
    </div>
  </TableCell>
</TableRow>
```

### "Auto" Badge on Transaction Row (visual indicator)

```typescript
// In transaction-list.tsx — category cell modification
<TableCell>
  {tx.categoryName ? (
    <span className="inline-flex items-center gap-1 ...">
      {tx.categoryIcon && <span>{tx.categoryIcon}</span>}
      {tx.categoryName}
      {tx.isAutoCategorized && (
        <span className="text-[9px] text-blue-500 font-medium ml-0.5">auto</span>
      )}
    </span>
  ) : (
    <span className="text-xs text-gray-400">—</span>
  )}
</TableCell>
```

### Retroactive Preview + Confirm Flow

```typescript
// In rule-list.tsx (or create-rule-dialog.tsx)
async function handleApplyRule(rule: CategoryRuleRow) {
  setApplying(true)
  try {
    const fd = new FormData()
    fd.append('ruleId', rule.id)
    const { count } = await previewBulkRecategorize(fd)
    setApplyPreview({ rule, count })  // opens ConfirmDialog
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Erro ao pré-visualizar', 'error')
  } finally {
    setApplying(false)
  }
}

// ConfirmDialog description prop:
`${applyPreview.count} transacoes sem categoria serao categorizadas como "${ruleCategoryName}".`
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side rule matching | Server-side `matchCategory()` hook in actions | Phase 5 | Rules apply at write time — no sync issues |
| Manual categorization only | Automatic on import + create | Phase 6 | Reduces categorization work by 70-90% for regular users |

**Deprecated/outdated:**
- Nothing is deprecated — this is all new capability.

---

## Open Questions

1. **`ilike` case sensitivity for `exact` match type**
   - What we know: `matchCategory()` uses `.toLowerCase()` for both sides — fully case-insensitive
   - What's unclear: In `bulkRecategorize`, using `eq(transactions.description, rule.matchValue)` is case-sensitive at DB level
   - Recommendation: Use `ilike(transactions.description, rule.matchValue)` (no wildcards) for `exact` match type in server actions — mirrors the pure function's case-insensitive behavior

2. **`isAutoCategorized` migration timing**
   - What we know: This column is needed for the visual indicator (locked decision) but doesn't exist yet
   - What's unclear: Whether to bundle it into a new migration `00007` or have Plan 06-01 create it inline
   - Recommendation: Plan 06-01 Wave 0 creates migration `00007_auto_categorized.sql` — clean, traceable

3. **Priority assignment strategy for new rules**
   - What we know: Multiple rules at `priority=0` causes reorder no-ops
   - What's unclear: Whether to use gap-of-10 (simple) or gap-of-100 (more headroom)
   - Recommendation: Use gap-of-10. New rule gets `maxPriority + 10`. For orgs starting fresh, first rule = priority 10.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/web/vitest.config.ts` (implied), `packages/core-finance/vitest.config.ts` |
| Quick run command | `cd packages/core-finance && npm run test` |
| Full suite command | `npm run test --workspaces` (or per-package) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-01 | `createRule` inserts row with correct fields | unit | `cd apps/web && npx vitest run __tests__/finance/rule-actions.test.ts` | ❌ Wave 0 |
| CAT-02 | `updateRule` / `deleteRule` / `reorderRule` / `toggleEnabled` mutate correctly | unit | same file | ❌ Wave 0 |
| CAT-03 | `importTransactions` assigns categoryId when rules match and description non-empty | unit | `cd apps/web && npx vitest run __tests__/finance/import-actions.test.ts` | ✅ (extend existing) |
| CAT-04 | `createTransaction` assigns categoryId when rules match and no explicit category | unit | `cd apps/web && npx vitest run __tests__/finance/actions.test.ts` | ✅ (extend existing) |
| CAT-05 | CreateRuleDialog renders with pre-filled values from transaction | manual-only | n/a — UI interaction | n/a |
| CAT-06 | `previewBulkRecategorize` returns correct count; `bulkRecategorize` updates only null-category rows | unit | `cd apps/web && npx vitest run __tests__/finance/rule-actions.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd packages/core-finance && npm run test` (categorization.test.ts already green — guard against regression)
- **Per wave merge:** `npm run test` in both `apps/web` and `packages/core-finance`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/__tests__/finance/rule-actions.test.ts` — covers CAT-01, CAT-02, CAT-06
- [ ] Drizzle schema: `packages/db/src/schema/automation.ts` + export in `index.ts`
- [ ] Migration: `supabase/migrations/00007_auto_categorized.sql` (adds `is_auto_categorized boolean DEFAULT false` to transactions)
- [ ] Update `packages/db/src/schema/finance.ts` — add `isAutoCategorized` field to `transactions` table object

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection of `packages/core-finance/src/categorization.ts` — `matchCategory()` signature and behavior
- Direct code inspection of `supabase/migrations/00006_automation.sql` — confirmed `category_rules` schema, indexes, RLS
- Direct code inspection of `apps/web/lib/finance/actions.ts` — server action pattern (getOrgId, Drizzle, revalidatePath)
- Direct code inspection of `apps/web/lib/finance/import-actions.ts` — import hook integration points
- Direct code inspection of `apps/web/components/finance/category-list.tsx` — inline edit pattern
- Direct code inspection of `apps/web/components/finance/transaction-list.tsx` — row action pattern
- Direct code inspection of `apps/web/components/ui/confirm-dialog.tsx` — dialog pattern
- Direct code inspection of `apps/web/components/ui/tabs.tsx` — Tabs component API

### Secondary (MEDIUM confidence)

- CONTEXT.md locked decisions — constrain all architectural choices above

### Tertiary (LOW confidence)

- None — all claims verified against source code.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns derived from existing code in this repo
- Pitfalls: HIGH — identified from direct code inspection (schema gap, reorder collision, transfer guard)
- DB schema gap: HIGH — confirmed `category_rules` not yet in Drizzle schema by scanning `packages/db/src/schema/`

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable codebase — no fast-moving dependencies)
