# Phase 7: Recurring Transactions - Research

**Researched:** 2026-03-19
**Domain:** Next.js Server Actions + Drizzle ORM + date-fns v4 (recurring template CRUD, transaction generation, balance updates)
**Confidence:** HIGH

## Summary

Phase 7 is the final phase of v1.1 Automacao. Like Phase 6, it is entirely additive — the hardest technical problems (DB schema, pure date functions, unique constraint for dedup) were solved in Phase 5. The `recurring_templates` table is live with RLS, indexes, and FK constraints. The `advanceByFrequency()` and `getOverdueDates()` pure functions are fully tested. `transactions.recurring_template_id` column and the unique index `uq_generated_transactions` already exist.

The two main work streams are: (1) server-side — Drizzle schema for `recurring_templates`, CRUD actions, generate action with atomic balance update + dedup guard, pause/reactivate, upcoming-due query; (2) client-side — `/transactions/recurring` page with template list, upcoming-due section, create/edit dialog, generate/pause actions, and sidebar nav item.

One gap to address upfront: `recurring_templates` exists in the SQL migration but has no Drizzle table object yet. A `recurringTemplates` table definition must be added to `packages/db/src/schema/automation.ts`. Similarly, `transactions.recurring_template_id` needs to be added to the Drizzle schema in `finance.ts`.

The most consequential implementation decision is in `generateTransaction`: it must atomically (1) insert the transaction with `recurring_template_id`, (2) update account balance, (3) advance `next_due_date` on the template — all inside a single `db.transaction()`. The unique index `(recurring_template_id, date)` provides the duplicate guard — if the insert fails with a conflict, the entire transaction rolls back safely.

**Primary recommendation:** Create the Drizzle schema first, then build server actions (Plan 07-01), then UI (Plan 07-02). Follow the existing `createTransaction` pattern for balance updates. Use `getOverdueDates()` to determine all overdue dates and generate them in a loop within a single transaction for bulk generation.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Recurring generation is **user-triggered in v1.1** (cron deferred to v2)
- `(recurring_template_id, date)` unique constraint prevents duplicate generation
- 6 frequencies: daily, weekly, biweekly, monthly, quarterly, yearly
- `date-fns@^4.1.0` for all date arithmetic (already installed in core-finance)
- `due_date` is `date` type (not timestamptz) — avoids timezone issues
- Rules apply only when `category_id IS NULL` — same guard applies to generated transactions
- Balance updates use inline `sql\`balance_cents + ${signedAmount}\`` pattern inside db.transaction

### Claude's Discretion
- Whether "Gerar agora" generates all overdue transactions at once or one at a time
- Template list display format (table vs cards)
- Whether to show last generated date
- Empty state design
- Confirmation dialog vs immediate generation with toast
- Whether to show generation summary after bulk generation
- Navigation placement details

### Deferred Ideas (OUT OF SCOPE)
- Automatic cron-based generation (REC-06)
- Cash flow dashboard projection (REC-07)
- End date / max occurrences on templates
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REC-01 | User can create a recurring template with account, category, type, amount, description, frequency, and start date | `createRecurringTemplate` server action + create dialog on /transactions/recurring |
| REC-02 | User can edit and delete recurring templates | `updateRecurringTemplate`, `deleteRecurringTemplate` actions + edit/delete in template list |
| REC-03 | User can click "Gerar agora" to create transaction and advance nextDueDate — no duplicates | `generateRecurringTransaction` action with dedup via unique index + atomic balance update |
| REC-04 | User can view upcoming recurring transactions due in next 30 days | `getUpcomingRecurring` query + upcoming section on /transactions/recurring |
| REC-05 | User can pause and reactivate a template without losing history | `toggleRecurringActive` action flips `is_active`; paused excluded from upcoming list |
</phase_requirements>

---

## Standard Stack

### Core (all already installed — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | existing | DB queries for `recurring_templates` CRUD and transaction generation | Already used throughout actions.ts and queries.ts |
| @floow/core-finance | workspace | `advanceByFrequency()`, `getOverdueDates()` pure functions | Phase 5 deliverable, fully tested |
| @floow/db | workspace | `recurringTemplates` Drizzle table object (to be created) | Needs addition to automation.ts |
| date-fns | ^4.1.0 | Date arithmetic in pure functions | Already installed in core-finance |
| next/cache `revalidatePath` | existing | Invalidate pages after mutations | Consistent with all other server actions |
| lucide-react | existing | Icons for template list actions | Already used in RuleList, TransactionList |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline balance update | Shared helper function | Inline is simpler, consistent with existing code; extracting adds indirection with minimal benefit for 1 call site |
| Loop-based multi-generation | Single-date generation | Loop handles overdue backlog; single-date requires multiple clicks |
| Dialog for create/edit | Separate page | Dialog matches Phase 6 pattern; separate page is heavier |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
packages/db/src/schema/
└── automation.ts          # Add: recurringTemplates Drizzle table (alongside categoryRules)

apps/web/
├── lib/finance/
│   ├── actions.ts          # Add: createRecurringTemplate, updateRecurringTemplate,
│   │                       #       deleteRecurringTemplate, generateRecurringTransaction,
│   │                       #       toggleRecurringActive
│   └── queries.ts          # Add: getRecurringTemplates(orgId), getUpcomingRecurring(orgId)
│
├── app/(app)/transactions/recurring/
│   └── page.tsx            # New: recurring templates page with upcoming-due section
│
├── components/finance/
│   ├── recurring-template-list.tsx  # New: template table with CRUD + generate + pause
│   └── create-recurring-dialog.tsx  # New: modal form for create/edit template
│
└── components/layout/
    └── sidebar.tsx          # Modify: add "Recorrentes" nav item
```

### Pattern 1: Drizzle Schema for recurring_templates

```typescript
// packages/db/src/schema/automation.ts — ADD alongside existing categoryRules
import { accounts } from './finance'  // add to existing imports

export const recurringTemplates = pgTable(
  'recurring_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    type: text('type').notNull().$type<'income' | 'expense'>(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    frequency: text('frequency').notNull().$type<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'>(),
    nextDueDate: date('next_due_date', { mode: 'date' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxRecurringTemplatesOrgId: index('idx_recurring_templates_org_id').on(table.orgId),
    idxRecurringTemplatesNextDueDate: index('idx_recurring_templates_next_due_date').on(table.nextDueDate),
  })
)

export type RecurringTemplateRow = typeof recurringTemplates.$inferSelect
export type NewRecurringTemplateRow = typeof recurringTemplates.$inferInsert
```

Note: The SQL migration `00006_automation.sql` uses `transaction_type` enum (which includes 'transfer'). However, recurring templates should NOT support 'transfer' type — the Drizzle type annotation restricts to `'income' | 'expense'` at the TypeScript level. The SQL CHECK constraint allows all transaction_type values but the server action should validate.

### Pattern 2: Add recurringTemplateId to transactions Drizzle schema

```typescript
// packages/db/src/schema/finance.ts — ADD to transactions table
recurringTemplateId: uuid('recurring_template_id').references(
  () => recurringTemplates.id, { onDelete: 'set null' }
),
```

This requires importing `recurringTemplates` from `./automation` — creates a cross-file reference. Since `finance.ts` already imports from other schema files and `automation.ts` imports from `finance.ts`, check for circular dependency. If circular, use inline reference string instead of function reference.

### Pattern 3: generateRecurringTransaction Server Action

```typescript
export async function generateRecurringTransaction(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const templateId = formData.get('templateId') as string

  // 1. Fetch template (verify ownership)
  const [template] = await db.select().from(recurringTemplates)
    .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
    .limit(1)
  if (!template) throw new Error('Template not found')
  if (!template.isActive) throw new Error('Template is paused')

  // 2. Get all overdue dates
  const today = new Date()
  today.setHours(0, 0, 0, 0) // normalize to midnight local
  const overdueDates = getOverdueDates(template.nextDueDate, template.frequency, today)
  if (overdueDates.length === 0) return { generated: 0 }

  // 3. Auto-categorize if no category
  let resolvedCategoryId = template.categoryId
  let isAutoCategorized = false
  if (!resolvedCategoryId && template.description) {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r) => r.isEnabled)
    const matched = matchCategory(template.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  // 4. Generate all overdue transactions atomically
  const signedAmount = template.type === 'income' ? template.amountCents : -template.amountCents
  let generated = 0

  await db.transaction(async (tx) => {
    for (const dueDate of overdueDates) {
      // Insert transaction (unique index prevents duplicates — ON CONFLICT DO NOTHING)
      const [inserted] = await tx
        .insert(transactions)
        .values({
          orgId,
          accountId: template.accountId,
          categoryId: resolvedCategoryId,
          type: template.type,
          amountCents: template.amountCents,
          description: template.description,
          date: dueDate,
          recurringTemplateId: template.id,
          isAutoCategorized,
        })
        .onConflictDoNothing({
          target: [transactions.recurringTemplateId, transactions.date],
        })
        .returning({ id: transactions.id })

      if (inserted) {
        // Update account balance only for actually inserted transactions
        await tx.update(accounts)
          .set({ balanceCents: sql`balance_cents + ${signedAmount}` })
          .where(eq(accounts.id, template.accountId))
        generated++
      }
    }

    // 5. Advance nextDueDate to after the last generated date
    const lastDate = overdueDates[overdueDates.length - 1]
    const newNextDueDate = advanceByFrequency(lastDate, template.frequency)
    await tx.update(recurringTemplates)
      .set({ nextDueDate: newNextDueDate, updatedAt: new Date() })
      .where(eq(recurringTemplates.id, template.id))
  })

  revalidatePath('/transactions')
  revalidatePath('/transactions/recurring')
  revalidatePath('/accounts')
  revalidatePath('/dashboard')

  return { generated }
}
```

### Pattern 4: getUpcomingRecurring Query

```typescript
export async function getUpcomingRecurring(orgId: string) {
  const db = getDb()
  const thirtyDaysFromNow = addDays(new Date(), 30)

  return db
    .select()
    .from(recurringTemplates)
    .where(and(
      eq(recurringTemplates.orgId, orgId),
      eq(recurringTemplates.isActive, true),
      lte(recurringTemplates.nextDueDate, thirtyDaysFromNow),
    ))
    .orderBy(asc(recurringTemplates.nextDueDate))
}
```

### Pattern 5: Circular Dependency Resolution

`automation.ts` imports `categories` from `finance.ts`. If `finance.ts` needs to import `recurringTemplates` from `automation.ts` for the FK, this creates a circular dependency.

**Solution:** Use a string-based reference or lazy reference:
```typescript
// In finance.ts — use inline SQL reference instead of Drizzle FK
recurringTemplateId: uuid('recurring_template_id'),
// The FK constraint already exists in SQL migration — Drizzle doesn't need to declare it
```

This avoids the circular import. The FK integrity is enforced by the SQL migration, not by Drizzle's schema declaration.

### Anti-Patterns to Avoid

- **Never generate transactions without updating balance** — every inserted transaction must be paired with a balance update in the same db.transaction
- **Never call `new Date()` inside pure functions** — pass reference date as parameter (already established in Phase 5)
- **Never allow duplicate generation** — rely on the unique index + `onConflictDoNothing`; count only actually inserted rows
- **Never generate for paused templates** — check `isActive` before proceeding
- **Never call `getCategoryRules()` inside db.transaction()** — fetch before (established in Phase 6)
- **Don't use transfer type for recurring templates** — transfers require two accounts; recurring templates model single-account operations
- **Date comparisons must use local dates** — use `new Date(Y, M, D)` pattern, not ISO strings, to avoid UTC-3 drift

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date advancement for frequencies | Custom date math | `advanceByFrequency()` from core-finance | Already tested, handles month-end clamping correctly |
| Overdue date enumeration | Manual loop | `getOverdueDates()` from core-finance | Already tested, boundary conditions handled |
| Duplicate prevention | Application-level check (SELECT then INSERT) | DB unique index + `onConflictDoNothing` | Race-condition-proof; single source of truth |
| Balance updates | Read-modify-write | `sql\`balance_cents + ${delta}\`` | Prevents race conditions; established pattern |
| Category auto-assignment | Manual lookup | `matchCategory()` from core-finance | Already tested and used in Phase 6 |

---

## Common Pitfalls

### Pitfall 1: Circular Import Between finance.ts and automation.ts

**What goes wrong:** TypeScript compilation fails with circular dependency error when `finance.ts` imports `recurringTemplates` from `automation.ts` which already imports `categories` from `finance.ts`.

**Why it happens:** Drizzle FK references require importing the target table.

**How to avoid:** Don't declare the FK in Drizzle for `recurringTemplateId`. Use a plain `uuid()` column without `.references()`. The FK constraint already exists in the SQL migration.

### Pitfall 2: Balance Not Updated for Generated Transactions

**What goes wrong:** Recurring transactions appear in the list but account balance doesn't change.

**Why it happens:** The generate action inserts the transaction but forgets the `balance_cents + delta` update.

**How to avoid:** Copy the exact balance update pattern from `createTransaction`. Ensure it's inside the same `db.transaction()` block.

### Pitfall 3: onConflictDoNothing Returns Empty Array

**What goes wrong:** When a duplicate is skipped by `onConflictDoNothing`, the `.returning()` call returns an empty array. If the code assumes the array always has an element, it crashes.

**Why it happens:** PostgreSQL's `ON CONFLICT DO NOTHING` skips the row entirely — no row is returned.

**How to avoid:** Check if `inserted` exists before updating balance: `if (inserted) { ... }`. Count only actually inserted rows.

### Pitfall 4: Timezone Drift in Date Comparison

**What goes wrong:** A template due "today" (e.g., 2026-03-19 BRT) is not shown as due because the comparison uses UTC.

**Why it happens:** `new Date()` returns UTC-based time; the `next_due_date` column is a calendar date (`date` type). Comparing a UTC timestamp against a calendar date can shift by one day in BRT (UTC-3).

**How to avoid:** Normalize `today` to midnight local time: `today.setHours(0, 0, 0, 0)`. For DB queries, compare using the `date` column directly (Drizzle handles `date` type as calendar dates).

### Pitfall 5: nextDueDate Not Advanced After Generation

**What goes wrong:** User clicks "Gerar agora" twice and nothing happens the second time (or it errors).

**Why it happens:** The action generates the transaction but forgets to advance `nextDueDate` on the template.

**How to avoid:** Always update `recurringTemplates.nextDueDate` to `advanceByFrequency(lastGeneratedDate, frequency)` inside the same transaction.

### Pitfall 6: Generating Transactions for Paused Templates

**What goes wrong:** Paused templates still generate transactions when the user somehow triggers generation.

**Why it happens:** The generate action doesn't check `isActive`.

**How to avoid:** Early return if `!template.isActive`. The UI should also hide/disable the "Gerar agora" button on paused templates.

---

## Code Examples

### Template List Row

```typescript
<TableRow key={template.id}>
  <TableCell>{template.description}</TableCell>
  <TableCell>{accountMap.get(template.accountId)}</TableCell>
  <TableCell>{categoryMap.get(template.categoryId ?? '')}</TableCell>
  <TableCell>{template.type === 'income' ? 'Receita' : 'Despesa'}</TableCell>
  <TableCell>{formatBRL(template.amountCents)}</TableCell>
  <TableCell>{frequencyLabel(template.frequency)}</TableCell>
  <TableCell>{formatDate(template.nextDueDate)}</TableCell>
  <TableCell>
    <span className={template.isActive ? 'text-green-600' : 'text-gray-400'}>
      {template.isActive ? 'Ativo' : 'Pausado'}
    </span>
  </TableCell>
  <TableCell>
    <div className="flex gap-1">
      {template.isActive && isDueOrOverdue && (
        <Button variant="outline" size="sm" onClick={() => handleGenerate(template)}>
          Gerar agora
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => handleToggleActive(template)}>
        {template.isActive ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => startEdit(template)}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(template)}>
        <Trash2 />
      </Button>
    </div>
  </TableCell>
</TableRow>
```

### Frequency Labels

```typescript
const frequencyLabels: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}
```

### Upcoming Due Section

```typescript
<section>
  <h2 className="text-lg font-semibold">Proximas a vencer</h2>
  {upcoming.length === 0 ? (
    <p className="text-sm text-gray-500">Nenhuma transacao recorrente nos proximos 30 dias.</p>
  ) : (
    <div className="space-y-2">
      {upcoming.map((t) => (
        <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <span className="font-medium">{t.description}</span>
            <span className="text-sm text-gray-500 ml-2">
              {formatBRL(t.amountCents)} — {formatDate(t.nextDueDate)}
            </span>
          </div>
          {t.nextDueDate <= today && (
            <Button variant="outline" size="sm" onClick={() => handleGenerate(t)}>
              Gerar agora
            </Button>
          )}
        </div>
      ))}
    </div>
  )}
</section>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual recurring entry | Template-based generation with auto-advance | Phase 7 | Eliminates repetitive data entry |
| N/A | User-triggered generation (cron in v2) | v1.1 design | Simpler; user retains control |

---

## Open Questions

1. **Should "Gerar agora" generate all overdue transactions or just one?**
   - Recommendation: Generate ALL overdue transactions at once. If a template is monthly and 3 months overdue, clicking "Gerar agora" generates all 3 transactions and advances nextDueDate past today. This is the expected behavior for a "catch up" scenario. Show a toast with the count: "3 transacoes geradas".

2. **Balance update: inline vs shared helper?**
   - Recommendation: Keep inline. The balance update is 2 lines of code. Extracting a helper adds indirection without meaningful reuse (only used in createTransaction and generateRecurringTransaction). STATE.md flagged this as a decision point — resolving in favor of inline for simplicity.

3. **Should generated transactions get auto-categorized?**
   - Recommendation: Yes, if the template has no category. Fetch rules before the db.transaction, apply `matchCategory()` to the template's description once, use the result for all generated transactions. This is consistent with Phase 6's behavior on createTransaction.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `packages/core-finance/vitest.config.ts` |
| Quick run command | `pnpm --filter @floow/core-finance test` |
| Full suite command | `pnpm --filter @floow/core-finance test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | createRecurringTemplate inserts template with all fields | TypeScript compilation | `npx tsc --noEmit -p apps/web/tsconfig.json` | N/A |
| REC-02 | updateRecurringTemplate / deleteRecurringTemplate mutate correctly | TypeScript compilation | same | N/A |
| REC-03 | generateRecurringTransaction creates transaction, updates balance, advances nextDueDate | TypeScript compilation + manual | same | N/A |
| REC-04 | getUpcomingRecurring returns active templates due within 30 days | TypeScript compilation | same | N/A |
| REC-05 | toggleRecurringActive flips isActive, paused excluded from upcoming | TypeScript compilation + manual | same | N/A |

### Sampling Rate

- **Per task commit:** `pnpm --filter @floow/core-finance test` (guard Phase 5 pure functions)
- **Per plan:** `npx tsc --noEmit -p apps/web/tsconfig.json` + `npx tsc --noEmit -p packages/db/tsconfig.json`
- **Phase gate:** Full TypeScript compilation green + manual verification

### Wave 0 Gaps

- [ ] Drizzle schema: `recurringTemplates` table in `packages/db/src/schema/automation.ts`
- [ ] Drizzle schema: `recurringTemplateId` field in `packages/db/src/schema/finance.ts`

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `packages/core-finance/src/recurring.ts` — pure functions verified
- Direct code inspection: `supabase/migrations/00006_automation.sql` — SQL schema verified
- Direct code inspection: `apps/web/lib/finance/actions.ts` — createTransaction, balance update, auto-categorize patterns
- Direct code inspection: `apps/web/lib/finance/queries.ts` — query patterns, getOrgId, getCategoryRules
- Direct code inspection: `packages/db/src/schema/automation.ts` — current state (categoryRules only)
- Direct code inspection: `packages/db/src/schema/finance.ts` — transactions table (no recurringTemplateId yet)
- Direct code inspection: `apps/web/components/layout/sidebar.tsx` — navigation structure

### Secondary (MEDIUM confidence)

- Phase 5 RESEARCH.md and SUMMARY.md — foundation decisions and patterns
- Phase 6 PLAN and SUMMARY files — established Phase 6 patterns to follow
- STATE.md — accumulated decisions and pending concerns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns derived from existing code in this repo
- Pitfalls: HIGH — identified from direct code inspection (circular dep, balance update, dedup)
- Pure functions: HIGH — Phase 5 deliverables fully tested, ready to consume

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable codebase — no fast-moving dependencies)
