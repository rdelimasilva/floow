# Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to create recurring transactions (income, expense, transfer) from the existing transaction form, generating all installments in batch with deferred balance application.

**Architecture:** Expand the existing transaction form with a "Recorrente" toggle. A dedicated server action generates all transactions in a single `db.transaction()`, storing a `recurring_templates` record as metadata. Future transactions have `balance_applied = false` and are reconciled when their date arrives. Cancellation deletes future transactions and marks the template inactive.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase PostgreSQL, Zod, date-fns, React Hook Form

**Spec:** `docs/superpowers/specs/2026-03-20-recurring-transactions-design.md`

---

## File Structure

### New files
- `supabase/migrations/00007_recurring_enhancements.sql` — ALTER TABLE for new columns + index changes
- `packages/core-finance/src/recurring-batch.ts` — pure function to generate all installment dates

### Modified files
- `packages/db/src/schema/automation.ts` — add `recurringTemplates` Drizzle table object
- `packages/db/src/schema/finance.ts` — add `recurringTemplateId`, `balanceApplied`, `installmentNumber`, `installmentTotal` to transactions
- `packages/shared/src/schemas/finance.ts` — add `createRecurringTransactionSchema` Zod schema
- `packages/shared/src/index.ts` — re-export new schema (already exports `*` from finance, no change needed)
- `apps/web/lib/finance/actions.ts` — add `createRecurringTransactions`, `cancelRecurring`, `reconcileRecurringBalances`; modify `deleteTransaction` and `updateTransaction` for `balance_applied` check
- `apps/web/lib/finance/queries.ts` — add `recurringTemplateId` to `getTransactions` select
- `apps/web/components/finance/transaction-form.tsx` — add recurring toggle + frequency/end-mode fields
- `apps/web/components/finance/transaction-list.tsx` — add Repeat icon, "Cancelar recorrência" action
- `apps/web/app/(app)/layout.tsx` — call `reconcileRecurringBalances` with short-circuit

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/00007_recurring_enhancements.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================================
-- Floow Recurring Enhancements Migration 00007
-- Adds new columns to recurring_templates and transactions for batch recurring
-- Updates deduplication index to support transfer pairs
-- =============================================================================

-- New columns on recurring_templates for batch generation metadata
ALTER TABLE public.recurring_templates
  ADD COLUMN end_mode text NOT NULL DEFAULT 'count',
  ADD COLUMN installment_count integer,
  ADD COLUMN end_date date,
  ADD COLUMN transfer_destination_account_id uuid REFERENCES public.accounts(id);

-- New columns on transactions for recurring tracking and balance reconciliation
ALTER TABLE public.transactions
  ADD COLUMN balance_applied boolean NOT NULL DEFAULT true,
  ADD COLUMN installment_number integer,
  ADD COLUMN installment_total integer;

-- Update deduplication index to include account_id (allows transfer pairs: same template+date, different accounts)
DROP INDEX IF EXISTS uq_generated_transactions;
CREATE UNIQUE INDEX uq_generated_transactions
  ON public.transactions (recurring_template_id, date, account_id)
  WHERE recurring_template_id IS NOT NULL;

-- Partial index for efficient reconciliation queries (only pending rows)
CREATE INDEX idx_transactions_balance_pending
  ON public.transactions (org_id, date)
  WHERE balance_applied = false AND recurring_template_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` or `npx supabase migration up` (depending on local setup)
Expected: Migration applies without errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00007_recurring_enhancements.sql
git commit -m "feat: add migration for recurring transaction enhancements"
```

---

## Task 2: Drizzle Schema — `recurringTemplates` table + transaction fields

**Files:**
- Modify: `packages/db/src/schema/automation.ts`
- Modify: `packages/db/src/schema/finance.ts`

- [ ] **Step 1: Add `recurringTemplates` table to `automation.ts`**

Add after the `categoryRules` table definition (after line 37):

```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, index, date } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories, transactionTypeEnum, accounts } from './finance'

// ... (existing categoryRules table stays unchanged) ...

// ---------------------------------------------------------------------------
// Recurring Templates
// ---------------------------------------------------------------------------

export const recurringTemplates = pgTable(
  'recurring_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    type: transactionTypeEnum('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    frequency: text('frequency').notNull().$type<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'>(),
    nextDueDate: date('next_due_date', { mode: 'date' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    endMode: text('end_mode').notNull().$type<'count' | 'end_date' | 'indefinite'>(),
    installmentCount: integer('installment_count'),
    endDate: date('end_date', { mode: 'date' }),
    transferDestinationAccountId: uuid('transfer_destination_account_id').references(() => accounts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxRecurringTemplatesOrgId: index('idx_recurring_templates_org_id').on(table.orgId),
  })
)

export type RecurringTemplate = typeof recurringTemplates.$inferSelect
export type NewRecurringTemplate = typeof recurringTemplates.$inferInsert
```

Note: The import line at top of file must be updated to include `date` from `drizzle-orm/pg-core` and `transactionTypeEnum, accounts` from `./finance`.

- [ ] **Step 2: Add new fields to `transactions` table in `finance.ts`**

In `packages/db/src/schema/finance.ts`, add these fields to the `transactions` table definition (after `isIgnored` field, before `createdAt`):

```typescript
    // Recurring transaction tracking
    recurringTemplateId: uuid('recurring_template_id'),
    balanceApplied: boolean('balance_applied').notNull().default(true),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
```

Note: No FK reference in Drizzle to avoid circular import. The FK exists in SQL migration 00006.

- [ ] **Step 3: Verify the package builds**

Run: `cd packages/db && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/automation.ts packages/db/src/schema/finance.ts
git commit -m "feat: add Drizzle schema for recurring templates and transaction fields"
```

---

## Task 3: Pure function — `generateInstallmentDates`

**Files:**
- Create: `packages/core-finance/src/recurring-batch.ts`

- [ ] **Step 1: Write the function**

```typescript
/**
 * Generates all installment dates for a recurring transaction batch.
 * Pure function — no side effects, fully deterministic given inputs.
 */
import { advanceByFrequency, type RecurringFrequency } from './recurring'

const MAX_INSTALLMENTS = 120

interface GenerateDatesInput {
  startDate: Date
  frequency: RecurringFrequency
  endMode: 'count' | 'end_date' | 'indefinite'
  installmentCount?: number
  endDate?: Date
}

/**
 * Returns an array of dates for each installment.
 * - count: exactly N dates
 * - end_date: dates from startDate up to endDate (inclusive)
 * - indefinite: up to 60 months, capped at MAX_INSTALLMENTS
 */
export function generateInstallmentDates(input: GenerateDatesInput): Date[] {
  const dates: Date[] = []
  let current = new Date(input.startDate) // clone to avoid mutation

  if (input.endMode === 'count') {
    const count = Math.min(input.installmentCount ?? 1, MAX_INSTALLMENTS)
    for (let i = 0; i < count; i++) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  } else if (input.endMode === 'end_date') {
    const limit = input.endDate ?? input.startDate
    while (current <= limit && dates.length < MAX_INSTALLMENTS) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  } else {
    // indefinite: generate up to 60 months worth, capped at MAX_INSTALLMENTS
    const sixtyMonthsLater = new Date(input.startDate)
    sixtyMonthsLater.setMonth(sixtyMonthsLater.getMonth() + 60)
    while (current <= sixtyMonthsLater && dates.length < MAX_INSTALLMENTS) {
      dates.push(current)
      current = advanceByFrequency(current, input.frequency)
    }
  }

  return dates
}
```

- [ ] **Step 2: Export from `packages/core-finance/src/index.ts`**

Add this line:
```typescript
export { generateInstallmentDates } from './recurring-batch'
```

- [ ] **Step 3: Verify the package builds**

Run: `cd packages/core-finance && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/core-finance/src/recurring-batch.ts packages/core-finance/src/index.ts
git commit -m "feat: add generateInstallmentDates pure function"
```

---

## Task 4: Zod validation schema

**Files:**
- Modify: `packages/shared/src/schemas/finance.ts`

- [ ] **Step 1: Add the schema**

Add after `updateTransactionSchema` (after line 36):

```typescript
export const createRecurringTransactionSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(['income', 'expense', 'transfer']),
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(500),
  startDate: z.coerce.date(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  endMode: z.enum(['count', 'end_date', 'indefinite']),
  installmentCount: z.number().int().min(1).max(120).optional(),
  endDate: z.coerce.date().optional(),
  destinationAccountId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.endMode === 'count' && !data.installmentCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Número de parcelas é obrigatório', path: ['installmentCount'] })
  }
  if (data.endMode === 'end_date' && !data.endDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data final é obrigatória', path: ['endDate'] })
  }
  if (data.endMode === 'end_date' && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Data final deve ser após a data inicial', path: ['endDate'] })
  }
  if (data.type === 'transfer' && !data.destinationAccountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Conta de destino é obrigatória para transferências', path: ['destinationAccountId'] })
  }
  if (data.type === 'transfer' && data.destinationAccountId === data.accountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Conta de destino deve ser diferente da conta de origem', path: ['destinationAccountId'] })
  }
})

export type CreateRecurringTransactionInput = z.infer<typeof createRecurringTransactionSchema>
```

- [ ] **Step 2: Verify build**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas/finance.ts
git commit -m "feat: add Zod schema for recurring transactions"
```

---

## Task 5: Server actions — `createRecurringTransactions`

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`

- [ ] **Step 1: Add imports at the top**

Add to the existing import from `@floow/db`:
```typescript
import { getDb, accounts, transactions, patrimonySnapshots, categories, categoryRules, recurringTemplates } from '@floow/db'
```

Add to the existing import from `@floow/shared`:
```typescript
import { createAccountSchema, createTransactionSchema, updateAccountSchema, updateTransactionSchema, createRecurringTransactionSchema } from '@floow/shared'
```

Add to the existing import from `@floow/core-finance`:
```typescript
import { computeSnapshot, matchCategory, generateInstallmentDates, advanceByFrequency } from '@floow/core-finance'
```

- [ ] **Step 2: Add `createRecurringTransactions` server action**

Add after the `createTransaction` function (after line 212):

```typescript
/**
 * Server action: create a recurring transaction series.
 * Generates all installments in batch within a single db.transaction().
 * Future transactions (date > today) have balance_applied = false.
 * A recurring_templates record is created as metadata for cancellation/tracking.
 */
export async function createRecurringTransactions(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const rawAmountCents = parseInt(formData.get('amountCents') as string, 10)
  const rawInstallmentCount = formData.get('installmentCount')
    ? parseInt(formData.get('installmentCount') as string, 10)
    : undefined

  const input = createRecurringTransactionSchema.parse({
    accountId: formData.get('accountId'),
    categoryId: formData.get('categoryId') || undefined,
    type: formData.get('type'),
    amountCents: rawAmountCents,
    description: formData.get('description'),
    startDate: formData.get('startDate'),
    frequency: formData.get('frequency'),
    endMode: formData.get('endMode'),
    installmentCount: rawInstallmentCount,
    endDate: formData.get('endDate') || undefined,
    destinationAccountId: formData.get('destinationAccountId') || undefined,
  })

  // Generate all installment dates
  const dates = generateInstallmentDates({
    startDate: input.startDate,
    frequency: input.frequency,
    endMode: input.endMode,
    installmentCount: input.installmentCount,
    endDate: input.endDate,
  })

  if (dates.length === 0) throw new Error('Nenhuma parcela gerada')

  const total = dates.length

  // Auto-categorize before entering transaction (avoid query inside tx)
  let resolvedCategoryId = input.categoryId ?? null
  let isAutoCategorized = false
  if (!resolvedCategoryId && input.description && input.type !== 'transfer') {
    const rules = await getCategoryRules(orgId)
    const enabledRules = rules.filter((r) => r.isEnabled)
    const matched = matchCategory(input.description, enabledRules)
    if (matched) {
      resolvedCategoryId = matched
      isAutoCategorized = true
    }
  }

  // Calculate "today" in Brazil timezone for balance_applied determination
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const today = new Date(todayStr)

  const result = await db.transaction(async (tx) => {
    // Verify account ownership and active status
    await assertAccountOwnership(tx as unknown as Db, input.accountId, orgId)
    if (input.type === 'transfer' && input.destinationAccountId) {
      await assertAccountOwnership(tx as unknown as Db, input.destinationAccountId, orgId)
    }

    // Verify accounts are active
    const [srcAccount] = await tx
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .limit(1)
    if (!srcAccount?.isActive) throw new Error('Conta de origem está inativa')

    if (input.type === 'transfer' && input.destinationAccountId) {
      const [dstAccount] = await tx
        .select({ isActive: accounts.isActive })
        .from(accounts)
        .where(eq(accounts.id, input.destinationAccountId))
        .limit(1)
      if (!dstAccount?.isActive) throw new Error('Conta de destino está inativa')
    }

    // Calculate next_due_date (date after last installment)
    const lastDate = dates[dates.length - 1]
    const nextDueDate = advanceByFrequency(lastDate, input.frequency)

    // Insert template
    const [template] = await tx
      .insert(recurringTemplates)
      .values({
        orgId,
        accountId: input.accountId,
        categoryId: resolvedCategoryId,
        type: input.type,
        amountCents: input.amountCents,
        description: input.description,
        frequency: input.frequency,
        nextDueDate,
        isActive: true,
        endMode: input.endMode,
        installmentCount: input.endMode === 'count' ? input.installmentCount : null,
        endDate: input.endMode === 'end_date' ? input.endDate : null,
        transferDestinationAccountId: input.type === 'transfer' ? input.destinationAccountId : null,
      })
      .returning()

    // Build transaction rows
    let sourceBalanceDelta = 0
    let destBalanceDelta = 0

    if (input.type === 'transfer' && input.destinationAccountId) {
      // Transfer: insert pairs
      for (let i = 0; i < dates.length; i++) {
        const installDate = dates[i]
        const isApplied = installDate <= today
        const transferGroupId = crypto.randomUUID()
        const desc = `${input.description} (${i + 1}/${total})`

        // Source leg (debit)
        await tx.insert(transactions).values({
          orgId,
          accountId: input.accountId,
          categoryId: null,
          type: 'transfer',
          amountCents: -input.amountCents,
          description: desc,
          date: installDate,
          transferGroupId,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized: false,
        })

        // Destination leg (credit)
        await tx.insert(transactions).values({
          orgId,
          accountId: input.destinationAccountId,
          categoryId: null,
          type: 'transfer',
          amountCents: input.amountCents,
          description: desc,
          date: installDate,
          transferGroupId,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized: false,
        })

        if (isApplied) {
          sourceBalanceDelta += -input.amountCents
          destBalanceDelta += input.amountCents
        }
      }

      // Update balances
      if (sourceBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${sourceBalanceDelta}` })
          .where(eq(accounts.id, input.accountId))
      }
      if (destBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${destBalanceDelta}` })
          .where(eq(accounts.id, input.destinationAccountId))
      }
    } else {
      // Income or expense
      const signedAmount = input.type === 'income' ? input.amountCents : -input.amountCents

      for (let i = 0; i < dates.length; i++) {
        const installDate = dates[i]
        const isApplied = installDate <= today
        const desc = `${input.description} (${i + 1}/${total})`

        await tx.insert(transactions).values({
          orgId,
          accountId: input.accountId,
          categoryId: resolvedCategoryId,
          type: input.type,
          amountCents: signedAmount,
          description: desc,
          date: installDate,
          recurringTemplateId: template.id,
          balanceApplied: isApplied,
          installmentNumber: i + 1,
          installmentTotal: total,
          isAutoCategorized,
        })

        if (isApplied) {
          sourceBalanceDelta += signedAmount
        }
      }

      // Update balance
      if (sourceBalanceDelta !== 0) {
        await tx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${sourceBalanceDelta}` })
          .where(eq(accounts.id, input.accountId))
      }
    }

    return template
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')

  return result
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/actions.ts
git commit -m "feat: add createRecurringTransactions server action"
```

---

## Task 6: Server actions — `cancelRecurring` and `reconcileRecurringBalances`

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`

- [ ] **Step 1: Add `cancelRecurring`**

Add after `createRecurringTransactions`:

```typescript
/**
 * Server action: cancel a recurring transaction series.
 * Deletes all future transactions (date > today) and marks template inactive.
 * Uses date > today (strictly greater) — today's transactions may already be reconciled.
 */
export async function cancelRecurring(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const templateId = formData.get('templateId') as string
  if (!templateId) throw new Error('Template ID is required')

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const today = new Date(todayStr)

  await db.transaction(async (tx) => {
    // Verify template belongs to org
    const [template] = await tx
      .select({ id: recurringTemplates.id })
      .from(recurringTemplates)
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
      .limit(1)

    if (!template) throw new Error('Template não encontrado')

    // Delete future transactions (balance_applied is false for these, no balance reversal needed)
    await tx
      .delete(transactions)
      .where(
        and(
          eq(transactions.recurringTemplateId, templateId),
          eq(transactions.orgId, orgId),
          sql`${transactions.date} > ${todayStr}::date`
        )
      )

    // Mark template inactive
    await tx
      .update(recurringTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(recurringTemplates.id, templateId), eq(recurringTemplates.orgId, orgId)))
  })

  revalidatePath('/transactions')
  revalidatePath('/accounts')
}
```

- [ ] **Step 2: Add `reconcileRecurringBalances`**

```typescript
/**
 * Reconciles balance for recurring transactions whose date has arrived.
 * Called from the app layout — short-circuits if no pending transactions exist.
 * Finds all transactions with balance_applied = false AND date <= today,
 * groups by account, and applies the cumulative balance delta.
 * Uses getOrgId() internally for authentication — safe to expose as server action.
 */
export async function reconcileRecurringBalances() {
  const orgId = await getOrgId()
  const db = getDb()

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const today = new Date(todayStr)

  // Short-circuit: check if any pending transactions exist
  const pending = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.balanceApplied, false),
        sql`${transactions.date} <= ${todayStr}::date`
      )
    )
    .limit(1)

  if (pending.length === 0) return

  // Fetch all pending transactions to reconcile
  const pendingTxs = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.balanceApplied, false),
        sql`${transactions.date} <= ${todayStr}::date`
      )
    )

  // Group by account
  const deltaByAccount = new Map<string, number>()
  const txIds: string[] = []
  for (const tx of pendingTxs) {
    deltaByAccount.set(tx.accountId, (deltaByAccount.get(tx.accountId) ?? 0) + tx.amountCents)
    txIds.push(tx.id)
  }

  await db.transaction(async (dbTx) => {
    // Apply balance deltas
    for (const [accountId, delta] of deltaByAccount) {
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${delta}` })
        .where(eq(accounts.id, accountId))
    }

    // Mark all as applied
    for (const txId of txIds) {
      await dbTx
        .update(transactions)
        .set({ balanceApplied: true })
        .where(eq(transactions.id, txId))
    }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/actions.ts
git commit -m "feat: add cancelRecurring and reconcileRecurringBalances actions"
```

---

## Task 7: Fix `deleteTransaction` and `updateTransaction` for `balance_applied`

**Files:**
- Modify: `apps/web/lib/finance/actions.ts`

- [ ] **Step 1: Fix `deleteTransaction`**

In the `deleteTransaction` function, wrap the balance reversal in a `balance_applied` check.

**In the transfer branch** (around line 292-297), change:

```typescript
      for (const leg of legs) {
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
          .where(eq(accounts.id, leg.accountId))
      }
```

To:

```typescript
      for (const leg of legs) {
        // Only reverse balance if it was already applied
        if (leg.balanceApplied) {
          await dbTx
            .update(accounts)
            .set({ balanceCents: sql`balance_cents + ${-leg.amountCents}` })
            .where(eq(accounts.id, leg.accountId))
        }
      }
```

**In the non-transfer branch** (around line 303-306), change:

```typescript
      await dbTx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
        .where(eq(accounts.id, tx.accountId))
```

To:

```typescript
      // Only reverse balance if it was already applied
      if (tx.balanceApplied) {
        await dbTx
          .update(accounts)
          .set({ balanceCents: sql`balance_cents + ${-tx.amountCents}` })
          .where(eq(accounts.id, tx.accountId))
      }
```

Note: The `select()` already returns all columns, so `balanceApplied` will be available on `tx` and `leg` objects once the schema is updated.

- [ ] **Step 2: Fix `updateTransaction`**

In `updateTransaction` (around line 395-399), change the balance reversal:

```typescript
    // Reverse old balance impact
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
      .where(eq(accounts.id, oldTx.accountId))
```

To:

```typescript
    // Reverse old balance impact only if it was applied
    if (oldTx.balanceApplied) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${-oldTx.amountCents}` })
        .where(eq(accounts.id, oldTx.accountId))
    }
```

And the new balance application (around line 401-405):

```typescript
    // Apply new balance impact (handles account change too)
    await tx
      .update(accounts)
      .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
      .where(eq(accounts.id, input.accountId))
```

To:

```typescript
    // Determine if the updated transaction should have balance applied
    const editedDate = new Date(input.date)
    const nowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const nowDate = new Date(nowStr)
    const shouldApplyBalance = editedDate <= nowDate || !oldTx.recurringTemplateId

    // Apply new balance impact only if the date qualifies
    if (shouldApplyBalance) {
      await tx
        .update(accounts)
        .set({ balanceCents: sql`balance_cents + ${newSignedAmount}` })
        .where(eq(accounts.id, input.accountId))
    }

    // Update balance_applied flag if this is a recurring transaction
    const balanceAppliedValue = oldTx.recurringTemplateId ? shouldApplyBalance : true
```

And in the transaction update `.set()` (around line 410-417), add `balanceApplied`:

```typescript
    await tx
      .update(transactions)
      .set({
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amountCents: newSignedAmount,
        description: input.description,
        date: new Date(input.date),
        balanceApplied: balanceAppliedValue,
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.orgId, orgId)))
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/actions.ts
git commit -m "fix: check balance_applied before reversing balance in delete/update"
```

---

## Task 8: Update queries — add `recurringTemplateId` to `getTransactions`

**Files:**
- Modify: `apps/web/lib/finance/queries.ts`

- [ ] **Step 1: Add field to select**

In `getTransactions` (around line 78-96), add after `isIgnored`:

```typescript
      recurringTemplateId: transactions.recurringTemplateId,
      balanceApplied: transactions.balanceApplied,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
```

- [ ] **Step 2: Filter `getRecentTransactions` to exclude unapplied future transactions**

In `getRecentTransactions` (around line 192), add `eq(transactions.balanceApplied, true)` to the where clause so cash flow charts don't include future recurring transactions that haven't impacted the balance:

```typescript
    .where(and(
      eq(transactions.orgId, orgId),
      gte(transactions.date, cutoff),
      eq(transactions.isIgnored, false),
      eq(transactions.balanceApplied, true)
    ))
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/queries.ts
git commit -m "feat: expose recurring fields in getTransactions, filter unapplied from cash flow"
```

---

## Task 9: Layout reconciliation

**Files:**
- Modify: `apps/web/app/(app)/layout.tsx`

- [ ] **Step 1: Add reconciliation call**

Add import at top:
```typescript
import { reconcileRecurringBalances } from '@/lib/finance/actions'
```

In the `AppLayout` function, after the session check and before the `return`, add:

```typescript
  // Reconcile recurring transaction balances (short-circuits if nothing pending)
  await reconcileRecurringBalances()
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(app)/layout.tsx
git commit -m "feat: call reconcileRecurringBalances from app layout"
```

---

## Task 10: Transaction form — recurring UI

**Files:**
- Modify: `apps/web/components/finance/transaction-form.tsx`

- [ ] **Step 1: Add recurring state and imports**

Add to imports:
```typescript
import { createTransaction, createCategory, createRecurringTransactions } from '@/lib/finance/actions'
import { formatBRL, currencyToCents, generateInstallmentDates } from '@floow/core-finance'
import type { RecurringFrequency } from '@floow/core-finance'
```

Add after existing `transactionFormSchema` (around line 44):

```typescript
const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
}

type EndMode = 'count' | 'end_date' | 'indefinite'
```

Inside the component function, add state after existing state declarations:

```typescript
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [endMode, setEndMode] = useState<EndMode>('count')
  const [installmentCount, setInstallmentCount] = useState('12')
  const [recurringEndDate, setRecurringEndDate] = useState('')
```

- [ ] **Step 2: Add preview calculation**

Add a computed preview inside the component:

```typescript
  // Preview text for recurring transactions
  const recurringPreview = (() => {
    if (!isRecurring) return null
    try {
      const startDateVal = form.getValues('date')
      if (!startDateVal) return null
      const startDate = new Date(startDateVal)
      startDate.setHours(0, 0, 0, 0)
      const amountRaw = form.getValues('amountRaw')
      const amountCents = amountRaw ? currencyToCents(amountRaw) : 0

      const dates = generateInstallmentDates({
        startDate,
        frequency,
        endMode,
        installmentCount: endMode === 'count' ? parseInt(installmentCount) || 1 : undefined,
        endDate: endMode === 'end_date' && recurringEndDate ? new Date(recurringEndDate) : undefined,
      })

      if (dates.length === 0) return null

      const firstDate = dates[0].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      const lastDate = dates[dates.length - 1].toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      const amountStr = amountCents > 0 ? formatBRL(amountCents) : 'R$ 0,00'

      return `Serão geradas ${dates.length} transações de ${amountStr}, de ${firstDate} a ${lastDate}`
    } catch {
      return null
    }
  })()
```

Note: Replace `form.getValues` with the actual method from your `useForm` instance — the existing code uses destructured `register`, `handleSubmit`, `control`, `setValue`. You need to also extract `watch` or `getValues` from `useForm`. Add `watch` to the destructured values:

```typescript
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormData>({ ... })
```

Then replace `form.getValues` with `watch`:

```typescript
      const startDateVal = watch('date')
      // ...
      const amountRaw = watch('amountRaw')
```

- [ ] **Step 3: Modify `onSubmit` to handle recurring**

Replace the existing `onSubmit` function:

```typescript
  async function onSubmit(data: TransactionFormData) {
    const amountCents = currencyToCents(data.amountRaw)
    if (amountCents <= 0) return

    if (isRecurring) {
      const formData = new FormData()
      formData.append('type', data.type)
      formData.append('accountId', data.accountId)
      formData.append('amountCents', String(amountCents))
      formData.append('description', data.description)
      formData.append('startDate', data.date)
      formData.append('frequency', frequency)
      formData.append('endMode', endMode)

      if (data.categoryId) formData.append('categoryId', data.categoryId)
      if (data.type === 'transfer' && data.transferToAccountId) {
        formData.append('destinationAccountId', data.transferToAccountId)
      }

      if (endMode === 'count') {
        formData.append('installmentCount', installmentCount)
      }
      if (endMode === 'end_date' && recurringEndDate) {
        formData.append('endDate', recurringEndDate)
      }

      await createRecurringTransactions(formData)
    } else {
      const formData = new FormData()
      formData.append('type', data.type)
      formData.append('accountId', data.accountId)
      formData.append('amountCents', String(amountCents))
      formData.append('description', data.description)
      formData.append('date', data.date)

      if (data.categoryId) formData.append('categoryId', data.categoryId)
      if (data.type === 'transfer' && data.transferToAccountId) {
        formData.append('transferToAccountId', data.transferToAccountId)
      }

      await createTransaction(formData)
    }

    if (onSuccess) {
      onSuccess()
    } else {
      router.push('/transactions')
    }
  }
```

- [ ] **Step 4: Add recurring fields to the JSX**

Add after the date field (after the `{/* Date */}` section, before `{/* Actions */}`):

```tsx
      {/* Recurring toggle */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">Recorrente</span>
        </label>
      </div>

      {isRecurring && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          {/* Frequency */}
          <div className="space-y-1.5">
            <Label>Frequência</Label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* End mode */}
          <div className="space-y-1.5">
            <Label>Término</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="count"
                  checked={endMode === 'count'}
                  onChange={() => setEndMode('count')}
                  className="border-gray-300"
                />
                <span className="text-sm">Número de parcelas</span>
              </label>
              {endMode === 'count' && (
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                  placeholder="Ex: 24"
                  className="ml-6 w-32"
                />
              )}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="end_date"
                  checked={endMode === 'end_date'}
                  onChange={() => setEndMode('end_date')}
                  className="border-gray-300"
                />
                <span className="text-sm">Até uma data</span>
              </label>
              {endMode === 'end_date' && (
                <Input
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  className="ml-6 w-48"
                />
              )}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="endMode"
                  value="indefinite"
                  checked={endMode === 'indefinite'}
                  onChange={() => setEndMode('indefinite')}
                  className="border-gray-300"
                />
                <span className="text-sm">Sem fim (máx. 60 meses)</span>
              </label>
            </div>
          </div>

          {/* Preview */}
          {recurringPreview && (
            <p className="text-xs text-gray-500 bg-white rounded px-3 py-2 border border-gray-100">
              {recurringPreview}
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 5: Update submit button text**

Change the submit button text to reflect recurring:

```tsx
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : isRecurring ? 'Criar Recorrência' : 'Registrar Transação'}
        </Button>
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/finance/transaction-form.tsx
git commit -m "feat: add recurring transaction fields to transaction form"
```

---

## Task 11: Transaction list — recurring indicator + cancel action

**Files:**
- Modify: `apps/web/components/finance/transaction-list.tsx`

- [ ] **Step 1: Update `TransactionRow` interface**

Add to the `TransactionRow` interface (after `isIgnored`):

```typescript
  recurringTemplateId?: string | null
  balanceApplied?: boolean
  installmentNumber?: number | null
  installmentTotal?: number | null
```

- [ ] **Step 2: Add imports**

Add to imports:
```typescript
import { Pencil, Trash2, Zap, EyeOff, Eye, Repeat, XCircle } from 'lucide-react'
import { deleteTransaction, updateTransaction, toggleIgnoreTransaction, createCategory, cancelRecurring } from '@/lib/finance/actions'
```

- [ ] **Step 3: Add cancel recurring state and handler**

Add after the existing state declarations (around line 80):

```typescript
  const [cancelTarget, setCancelTarget] = useState<{ templateId: string; description: string } | null>(null)

  async function handleCancelRecurring() {
    if (!cancelTarget) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('templateId', cancelTarget.templateId)
      await cancelRecurring(formData)
      setCancelTarget(null)
      toast('Recorrência cancelada — parcelas futuras removidas')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao cancelar recorrência', 'error')
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 4: Add Repeat icon to description column**

In the non-editing `<tr>` (around line 302), modify the description `<td>`:

```tsx
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <span className="flex items-center gap-1.5">
                      {tx.recurringTemplateId && (
                        <Repeat className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      )}
                      {tx.description}
                    </span>
                  </td>
```

- [ ] **Step 5: Add "Cancelar recorrência" action button**

In the actions `<td>` (around line 329), add a cancel recurring button before the delete/ignore buttons:

```tsx
                      {tx.recurringTemplateId && (
                        <button
                          type="button"
                          title="Cancelar recorrência"
                          onClick={() => setCancelTarget({ templateId: tx.recurringTemplateId!, description: tx.description })}
                          className="rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-600"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
```

- [ ] **Step 6: Add visual indicator for future/scheduled transactions**

Modify the `<tr>` className to reduce opacity for future non-applied transactions:

```tsx
                <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${tx.isIgnored ? 'opacity-40 line-through' : ''} ${tx.balanceApplied === false ? 'opacity-60' : ''}`}>
```

- [ ] **Step 7: Add cancel confirm dialog**

After the existing `CreateRuleDialog` (at the end of the component, before the closing `</>`):

```tsx
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelRecurring}
        title="Cancelar recorrência"
        description={`Tem certeza que deseja cancelar a recorrência "${cancelTarget?.description ?? ''}"? Todas as parcelas futuras serão removidas. Parcelas já vencidas permanecem.`}
        confirmLabel="Cancelar recorrência"
        loading={loading}
      />
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/finance/transaction-list.tsx
git commit -m "feat: add recurring indicators and cancel action to transaction list"
```

---

## Task 12: Verify end-to-end

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` (or `pnpm dev`)
Expected: No build errors

- [ ] **Step 2: Manual test — create a recurring expense**

1. Go to /transactions, click "Nova Transação"
2. Select Despesa, fill account, amount R$ 100, description "Teste Recorrente", date today
3. Check "Recorrente"
4. Select Mensal, 6 parcelas
5. Verify preview text shows "Serão geradas 6 transações..."
6. Submit
7. Verify 6 transactions appear in the list with "(1/6)" through "(6/6)" and Repeat icon
8. Verify only today's transaction (if any) affects the balance

- [ ] **Step 3: Manual test — cancel recurring**

1. Click the XCircle icon on one of the recurring transactions
2. Confirm cancellation
3. Verify future transactions are removed, past ones remain

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
