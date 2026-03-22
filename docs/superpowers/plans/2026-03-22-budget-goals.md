# Budget Goals (Orçamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a budget module with spending goals (global + per-category limits) and investment goals (periodic contributions + patrimony target), with automatic progress tracking from existing transactions and dashboard alerts.

**Architecture:** New Drizzle schema (`budget.ts`) with 3 tables + migration + RLS. Server-side queries compute progress by aggregating transactions/portfolio_events against goals. Two new pages under `/budgets/spending` and `/budgets/investing`. Dashboard gets a new Suspense section for at-risk alerts.

**Tech Stack:** Next.js App Router (RSC), Drizzle ORM, Supabase (Postgres + RLS), Recharts, lucide-react, Zod validation

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/db/src/schema/budget.ts` | Drizzle schema: 2 enums + 3 tables + types |
| Modify | `packages/db/src/index.ts` | Barrel export for budget schema |
| Create | `supabase/migrations/00014_budget_goals.sql` | DDL + RLS policies |
| Create | `apps/web/lib/finance/budget-queries.ts` | All budget read queries + progress computation |
| Create | `apps/web/lib/finance/budget-actions.ts` | Server actions: CRUD goals, limits, adjustments |
| Create | `apps/web/components/finance/budget-progress-bar.tsx` | Reusable color-coded progress bar |
| Create | `apps/web/components/finance/budget-goal-form.tsx` | Create/edit goal dialog |
| Create | `apps/web/components/finance/budget-adjustment-dialog.tsx` | Manual adjustment dialog |
| Create | `apps/web/components/finance/budget-alert-card.tsx` | Dashboard alert card |
| Create | `apps/web/app/(app)/budgets/spending/page.tsx` | Spending goals page |
| Create | `apps/web/app/(app)/budgets/investing/page.tsx` | Investment goals page |
| Modify | `apps/web/components/layout/sidebar.tsx` | Add "Orçamento" nav section |
| Modify | `apps/web/app/(app)/dashboard/page.tsx` | Add budget alerts Suspense section |

---

### Task 1: Database Schema + Migration

**Files:**
- Create: `packages/db/src/schema/budget.ts`
- Modify: `packages/db/src/index.ts`
- Create: `supabase/migrations/00014_budget_goals.sql`

- [ ] **Step 1: Create Drizzle schema**

Create `packages/db/src/schema/budget.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories } from './finance'

export const budgetGoalTypeEnum = pgEnum('budget_goal_type', ['spending', 'investing'])

export const budgetPeriodEnum = pgEnum('budget_period', ['monthly', 'quarterly', 'semiannual', 'annual'])

export const budgetGoals = pgTable(
  'budget_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    type: budgetGoalTypeEnum('type').notNull(),
    name: text('name').notNull(),
    targetCents: integer('target_cents').notNull(),
    period: budgetPeriodEnum('period').notNull(),
    patrimonyTargetCents: integer('patrimony_target_cents'),
    patrimonyDeadline: date('patrimony_deadline', { mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxBudgetGoalsOrgTypeActive: index('idx_budget_goals_org_type_active').on(
      table.orgId,
      table.type,
      table.isActive
    ),
  })
)

export const budgetCategoryLimits = pgTable(
  'budget_category_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetGoalId: uuid('budget_goal_id')
      .notNull()
      .references(() => budgetGoals.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    limitCents: integer('limit_cents').notNull(),
  },
  (table) => ({
    uqBudgetCategoryLimit: uniqueIndex('uq_budget_category_limit').on(
      table.budgetGoalId,
      table.categoryId
    ),
    idxBudgetCategoryLimitsGoal: index('idx_budget_category_limits_goal').on(table.budgetGoalId),
  })
)

export const budgetAdjustments = pgTable(
  'budget_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    budgetGoalId: uuid('budget_goal_id')
      .notNull()
      .references(() => budgetGoals.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    date: date('date', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxBudgetAdjustmentsGoalDate: index('idx_budget_adjustments_goal_date').on(
      table.budgetGoalId,
      table.date
    ),
  })
)

export type BudgetGoal = typeof budgetGoals.$inferSelect
export type NewBudgetGoal = typeof budgetGoals.$inferInsert
export type BudgetCategoryLimit = typeof budgetCategoryLimits.$inferSelect
export type BudgetAdjustment = typeof budgetAdjustments.$inferSelect
```

- [ ] **Step 2: Add barrel export**

In `packages/db/src/index.ts`, add:

```typescript
export * from './schema/budget'
```

- [ ] **Step 3: Create SQL migration**

Create `supabase/migrations/00014_budget_goals.sql`:

```sql
-- Budget Goals module
CREATE TYPE budget_goal_type AS ENUM ('spending', 'investing');
CREATE TYPE budget_period AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual');

CREATE TABLE budget_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  type budget_goal_type NOT NULL,
  name text NOT NULL,
  target_cents integer NOT NULL,
  period budget_period NOT NULL,
  patrimony_target_cents integer,
  patrimony_deadline date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_goals_org_type_active ON budget_goals (org_id, type, is_active);

ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_goals_org_isolation ON budget_goals
  USING (org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid);

CREATE TABLE budget_category_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_goal_id uuid NOT NULL REFERENCES budget_goals(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  limit_cents integer NOT NULL
);

CREATE UNIQUE INDEX uq_budget_category_limit ON budget_category_limits (budget_goal_id, category_id);
CREATE INDEX idx_budget_category_limits_goal ON budget_category_limits (budget_goal_id);

ALTER TABLE budget_category_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_category_limits_org_isolation ON budget_category_limits
  USING (budget_goal_id IN (SELECT id FROM budget_goals WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid));

CREATE TABLE budget_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_goal_id uuid NOT NULL REFERENCES budget_goals(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_adjustments_goal_date ON budget_adjustments (budget_goal_id, date);

ALTER TABLE budget_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_adjustments_org_isolation ON budget_adjustments
  USING (budget_goal_id IN (SELECT id FROM budget_goals WHERE org_id = (current_setting('request.jwt.claims', true)::json -> 'app_metadata' ->> 'org_id')::uuid));
```

- [ ] **Step 4: Run migration on Supabase**

Run the SQL from `00014_budget_goals.sql` in the Supabase SQL Editor.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/budget.ts packages/db/src/index.ts supabase/migrations/00014_budget_goals.sql
git commit -m "feat(budget): add Drizzle schema and migration for budget goals"
```

---

### Task 2: Budget Queries + Period Helpers

**Files:**
- Create: `apps/web/lib/finance/budget-queries.ts`

- [ ] **Step 1: Create budget-queries.ts**

```typescript
import { cache } from 'react'
import { getDb, budgetGoals, budgetCategoryLimits, budgetAdjustments, transactions, portfolioEvents } from '@floow/db'
import { eq, and, sql, gte, lte, sum } from 'drizzle-orm'

/** Computes the start/end dates for the current period of a goal. */
export function getCurrentPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (period) {
    case 'monthly':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
    case 'quarterly': {
      const q = Math.floor(m / 3)
      return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 0) }
    }
    case 'semiannual': {
      const s = m < 6 ? 0 : 1
      return { start: new Date(y, s * 6, 1), end: new Date(y, s * 6 + 6, 0) }
    }
    case 'annual':
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) }
    default:
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
  }
}

/** Returns active budget goals for the org, filtered by type. */
export const getBudgetGoals = cache(async function getBudgetGoals(
  orgId: string,
  type: 'spending' | 'investing'
) {
  const db = getDb()
  return db
    .select()
    .from(budgetGoals)
    .where(and(eq(budgetGoals.orgId, orgId), eq(budgetGoals.type, type), eq(budgetGoals.isActive, true)))
    .orderBy(budgetGoals.createdAt)
})

/** Returns category limits for a given budget goal. */
export const getCategoryLimits = cache(async function getCategoryLimits(goalId: string) {
  const db = getDb()
  return db
    .select()
    .from(budgetCategoryLimits)
    .where(eq(budgetCategoryLimits.budgetGoalId, goalId))
})

/** Returns spending by category for the given org + date range. */
export async function getSpendingByCategory(orgId: string, start: Date, end: Date) {
  const db = getDb()
  return db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<number>`SUM(ABS(${transactions.amountCents}))`.as('spent'),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orgId, orgId),
        eq(transactions.type, 'expense'),
        eq(transactions.isIgnored, false),
        gte(transactions.date, start),
        lte(transactions.date, end)
      )
    )
    .groupBy(transactions.categoryId)
}

/** Returns total investment contributions for the given org + date range. */
export async function getInvestmentContributions(orgId: string, start: Date, end: Date) {
  const db = getDb()
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${portfolioEvents.totalCostCents}), 0)`.as('total'),
    })
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.orgId, orgId),
        eq(portfolioEvents.eventType, 'buy'),
        gte(portfolioEvents.eventDate, start),
        lte(portfolioEvents.eventDate, end)
      )
    )
  return result.total
}

/** Returns adjustments for a goal within a date range. */
export async function getAdjustments(goalId: string, start: Date, end: Date) {
  const db = getDb()
  return db
    .select()
    .from(budgetAdjustments)
    .where(
      and(
        eq(budgetAdjustments.budgetGoalId, goalId),
        gte(budgetAdjustments.date, start),
        lte(budgetAdjustments.date, end)
      )
    )
}

/** Sum of adjustments for a goal in a period. */
export async function getAdjustmentTotal(goalId: string, start: Date, end: Date) {
  const db = getDb()
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${budgetAdjustments.amountCents}), 0)`.as('total'),
    })
    .from(budgetAdjustments)
    .where(
      and(
        eq(budgetAdjustments.budgetGoalId, goalId),
        gte(budgetAdjustments.date, start),
        lte(budgetAdjustments.date, end)
      )
    )
  return result.total
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep budget`

Expected: no errors in budget files

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/finance/budget-queries.ts
git commit -m "feat(budget): add budget queries and period helpers"
```

---

### Task 3: Server Actions (CRUD)

**Files:**
- Create: `apps/web/lib/finance/budget-actions.ts`

- [ ] **Step 1: Create budget-actions.ts**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { getDb, budgetGoals, budgetCategoryLimits, budgetAdjustments } from '@floow/db'
import { eq, and } from 'drizzle-orm'
import { getOrgId } from './queries'

export async function upsertBudgetGoal(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()

  const id = formData.get('id') as string | null
  const type = formData.get('type') as 'spending' | 'investing'
  const name = formData.get('name') as string
  const targetCents = parseInt(formData.get('targetCents') as string, 10)
  const period = formData.get('period') as string
  const patrimonyTargetCents = formData.get('patrimonyTargetCents')
    ? parseInt(formData.get('patrimonyTargetCents') as string, 10)
    : null
  const patrimonyDeadline = formData.get('patrimonyDeadline')
    ? new Date(formData.get('patrimonyDeadline') as string)
    : null

  if (id) {
    // Update
    await db
      .update(budgetGoals)
      .set({ name, targetCents, period, patrimonyTargetCents, patrimonyDeadline })
      .where(and(eq(budgetGoals.id, id), eq(budgetGoals.orgId, orgId)))
  } else {
    // Insert
    await db.insert(budgetGoals).values({
      orgId,
      type,
      name,
      targetCents,
      period,
      patrimonyTargetCents,
      patrimonyDeadline,
    })
  }

  revalidatePath(type === 'spending' ? '/budgets/spending' : '/budgets/investing')
  revalidatePath('/dashboard')
}

export async function deleteBudgetGoal(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const id = formData.get('id') as string

  await db.delete(budgetGoals).where(and(eq(budgetGoals.id, id), eq(budgetGoals.orgId, orgId)))

  revalidatePath('/budgets/spending')
  revalidatePath('/budgets/investing')
  revalidatePath('/dashboard')
}

export async function saveCategoryLimits(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const goalId = formData.get('goalId') as string
  const limitsJson = formData.get('limits') as string
  const limits: { categoryId: string; limitCents: number }[] = JSON.parse(limitsJson)

  // Verify goal ownership
  const [goal] = await db
    .select({ id: budgetGoals.id })
    .from(budgetGoals)
    .where(and(eq(budgetGoals.id, goalId), eq(budgetGoals.orgId, orgId)))
    .limit(1)
  if (!goal) throw new Error('Goal not found')

  // Delete existing limits and re-insert
  await db.delete(budgetCategoryLimits).where(eq(budgetCategoryLimits.budgetGoalId, goalId))

  if (limits.length > 0) {
    await db.insert(budgetCategoryLimits).values(
      limits.map((l) => ({
        budgetGoalId: goalId,
        categoryId: l.categoryId,
        limitCents: l.limitCents,
      }))
    )
  }

  revalidatePath('/budgets/spending')
  revalidatePath('/dashboard')
}

export async function createAdjustment(formData: FormData) {
  const orgId = await getOrgId()
  const db = getDb()
  const goalId = formData.get('goalId') as string
  const amountCents = parseInt(formData.get('amountCents') as string, 10)
  const description = formData.get('description') as string
  const date = new Date(formData.get('date') as string)

  // Verify goal ownership
  const [goal] = await db
    .select({ id: budgetGoals.id, type: budgetGoals.type })
    .from(budgetGoals)
    .where(and(eq(budgetGoals.id, goalId), eq(budgetGoals.orgId, orgId)))
    .limit(1)
  if (!goal) throw new Error('Goal not found')

  await db.insert(budgetAdjustments).values({
    budgetGoalId: goalId,
    amountCents,
    description,
    date,
  })

  revalidatePath(goal.type === 'spending' ? '/budgets/spending' : '/budgets/investing')
  revalidatePath('/dashboard')
}

export async function deleteAdjustment(formData: FormData) {
  const db = getDb()
  const id = formData.get('id') as string
  await db.delete(budgetAdjustments).where(eq(budgetAdjustments.id, id))

  revalidatePath('/budgets/spending')
  revalidatePath('/budgets/investing')
  revalidatePath('/dashboard')
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/finance/budget-actions.ts
git commit -m "feat(budget): add server actions for goals, limits, and adjustments"
```

---

### Task 4: Shared UI Components

**Files:**
- Create: `apps/web/components/finance/budget-progress-bar.tsx`
- Create: `apps/web/components/finance/budget-goal-form.tsx`
- Create: `apps/web/components/finance/budget-adjustment-dialog.tsx`

- [ ] **Step 1: Create BudgetProgressBar**

Create `apps/web/components/finance/budget-progress-bar.tsx`:

```typescript
'use client'

import { formatBRL } from '@floow/core-finance'

interface BudgetProgressBarProps {
  label: string
  currentCents: number
  limitCents: number
  /** If true, "over limit" is bad (spending). If false, "under target" is bad (investing). */
  invertColors?: boolean
}

export function BudgetProgressBar({ label, currentCents, limitCents, invertColors = false }: BudgetProgressBarProps) {
  const pct = limitCents > 0 ? Math.min((currentCents / limitCents) * 100, 100) : 0
  const overflowPct = limitCents > 0 ? (currentCents / limitCents) * 100 : 0

  let color: string
  if (invertColors) {
    // Investing: green when high, red when low
    color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  } else {
    // Spending: green when low, red when high
    color = pct < 70 ? 'bg-green-500' : pct < 90 ? 'bg-yellow-500' : 'bg-red-500'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {formatBRL(currentCents)} / {formatBRL(limitCents)}
          <span className="ml-1 text-xs">({Math.round(overflowPct)}%)</span>
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create BudgetGoalForm**

Create `apps/web/components/finance/budget-goal-form.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { upsertBudgetGoal } from '@/lib/finance/budget-actions'
import { useToast } from '@/components/ui/toast'

interface CategoryOption { id: string; name: string; type: string }

interface BudgetGoalFormProps {
  type: 'spending' | 'investing'
  goal?: {
    id: string; name: string; targetCents: number; period: string
    patrimonyTargetCents?: number | null; patrimonyDeadline?: Date | null
  }
  onClose: () => void
}

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export function BudgetGoalForm({ type, goal, onClose }: BudgetGoalFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(goal?.name ?? '')
  const [targetCents, setTargetCents] = useState(goal ? String(goal.targetCents) : '')
  const [period, setPeriod] = useState(goal?.period ?? 'monthly')
  const [patrimonyTargetCents, setPatrimonyTargetCents] = useState(
    goal?.patrimonyTargetCents ? String(goal.patrimonyTargetCents) : ''
  )
  const [patrimonyDeadline, setPatrimonyDeadline] = useState(
    goal?.patrimonyDeadline ? goal.patrimonyDeadline.toISOString().split('T')[0] : ''
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      if (goal?.id) formData.append('id', goal.id)
      formData.append('type', type)
      formData.append('name', name)
      formData.append('targetCents', targetCents)
      formData.append('period', period)
      if (type === 'investing' && patrimonyTargetCents) {
        formData.append('patrimonyTargetCents', patrimonyTargetCents)
      }
      if (type === 'investing' && patrimonyDeadline) {
        formData.append('patrimonyDeadline', patrimonyDeadline)
      }
      await upsertBudgetGoal(formData)
      toast(goal ? 'Meta atualizada' : 'Meta criada')
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar meta', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700">Nome</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Orçamento mensal" required />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">
          {type === 'spending' ? 'Teto (centavos)' : 'Meta de aporte (centavos)'}
        </label>
        <Input type="number" value={targetCents} onChange={(e) => setTargetCents(e.target.value)} required />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">Período</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
        >
          {Object.entries(PERIOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      {type === 'investing' && (
        <>
          <div>
            <label className="text-sm font-medium text-gray-700">Meta de patrimônio (centavos, opcional)</label>
            <Input type="number" value={patrimonyTargetCents} onChange={(e) => setPatrimonyTargetCents(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Data limite (opcional)</label>
            <Input type="date" value={patrimonyDeadline} onChange={(e) => setPatrimonyDeadline(e.target.value)} />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={loading}>{goal ? 'Salvar' : 'Criar'}</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Create BudgetAdjustmentDialog**

Create `apps/web/components/finance/budget-adjustment-dialog.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createAdjustment } from '@/lib/finance/budget-actions'
import { useToast } from '@/components/ui/toast'

interface BudgetAdjustmentDialogProps {
  goalId: string
  open: boolean
  onClose: () => void
}

export function BudgetAdjustmentDialog({ goalId, open, onClose }: BudgetAdjustmentDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [amountCents, setAmountCents] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('goalId', goalId)
      formData.append('amountCents', amountCents)
      formData.append('description', description)
      formData.append('date', date)
      await createAdjustment(formData)
      toast('Ajuste registrado')
      setAmountCents('')
      setDescription('')
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao registrar ajuste', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">Ajuste Manual</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Valor (centavos, negativo para subtrair)</label>
            <Input type="number" value={amountCents} onChange={(e) => setAmountCents(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Motivo do ajuste" required />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>Registrar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/finance/budget-progress-bar.tsx apps/web/components/finance/budget-goal-form.tsx apps/web/components/finance/budget-adjustment-dialog.tsx
git commit -m "feat(budget): add shared UI components (progress bar, form, adjustment dialog)"
```

---

### Task 5: Spending Goals Page

**Files:**
- Create: `apps/web/app/(app)/budgets/spending/page.tsx`

- [ ] **Step 1: Create spending page**

Create `apps/web/app/(app)/budgets/spending/page.tsx`:

```typescript
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOrgId, getCategories } from '@/lib/finance/queries'
import { getBudgetGoals, getCategoryLimits, getSpendingByCategory, getAdjustmentTotal, getCurrentPeriodRange } from '@/lib/finance/budget-queries'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { SpendingGoalClient } from './client'
import { formatBRL } from '@floow/core-finance'

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export default async function SpendingGoalsPage() {
  const orgId = await getOrgId()
  const [goals, categories] = await Promise.all([
    getBudgetGoals(orgId, 'spending'),
    getCategories(orgId),
  ])

  const goal = goals[0] // one active spending goal at a time

  if (!goal) {
    return (
      <SpendingGoalClient
        goal={null}
        categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        globalSpent={0}
        categorySpending={[]}
        categoryLimits={[]}
        periodLabel=""
      />
    )
  }

  const { start, end } = getCurrentPeriodRange(goal.period)
  const [spending, limits, adjustmentTotal] = await Promise.all([
    getSpendingByCategory(orgId, start, end),
    getCategoryLimits(goal.id),
    getAdjustmentTotal(goal.id, start, end),
  ])

  const globalSpent = spending.reduce((sum, s) => sum + Number(s.spent), 0) + adjustmentTotal
  const categorySpending = spending.map((s) => ({
    categoryId: s.categoryId,
    spent: Number(s.spent),
  }))

  const periodLabel = PERIOD_LABELS[goal.period] ?? goal.period

  return (
    <SpendingGoalClient
      goal={{
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        period: goal.period,
      }}
      categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
      globalSpent={globalSpent}
      categorySpending={categorySpending}
      categoryLimits={limits.map((l) => ({
        categoryId: l.categoryId,
        limitCents: l.limitCents,
      }))}
      periodLabel={periodLabel}
    />
  )
}
```

- [ ] **Step 2: Create spending client component**

Create `apps/web/app/(app)/budgets/spending/client.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { BudgetGoalForm } from '@/components/finance/budget-goal-form'
import { BudgetAdjustmentDialog } from '@/components/finance/budget-adjustment-dialog'
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react'

interface SpendingGoalClientProps {
  goal: { id: string; name: string; targetCents: number; period: string } | null
  categories: { id: string; name: string; type: string }[]
  globalSpent: number
  categorySpending: { categoryId: string | null; spent: number }[]
  categoryLimits: { categoryId: string; limitCents: number }[]
  periodLabel: string
}

export function SpendingGoalClient({
  goal, categories, globalSpent, categorySpending, categoryLimits, periodLabel,
}: SpendingGoalClientProps) {
  const [showForm, setShowForm] = useState(false)
  const [showAdjustment, setShowAdjustment] = useState(false)

  if (!goal && !showForm) {
    return (
      <div className="space-y-4">
        <PageHeader title="Meta de Gastos" description="Defina limites de gastos por período" />
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500">Nenhuma meta de gastos configurada.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Criar meta
          </Button>
        </div>
      </div>
    )
  }

  if (showForm) {
    return (
      <div className="space-y-4">
        <PageHeader title={goal ? 'Editar Meta de Gastos' : 'Criar Meta de Gastos'} />
        <Card>
          <CardContent className="pt-6">
            <BudgetGoalForm
              type="spending"
              goal={goal ?? undefined}
              onClose={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <div className="space-y-4">
      <PageHeader title="Meta de Gastos" description={`Período: ${periodLabel}`}>
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar meta
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAdjustment(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Ajuste manual
        </Button>
      </PageHeader>

      {/* Global limit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{goal!.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetProgressBar label="Teto global" currentCents={globalSpent} limitCents={goal!.targetCents} />
        </CardContent>
      </Card>

      {/* Per-category limits */}
      {categoryLimits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limites por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryLimits.map((limit) => {
              const cat = expenseCategories.find((c) => c.id === limit.categoryId)
              const spent = categorySpending.find((s) => s.categoryId === limit.categoryId)?.spent ?? 0
              return (
                <BudgetProgressBar
                  key={limit.categoryId}
                  label={cat?.name ?? 'Sem categoria'}
                  currentCents={spent}
                  limitCents={limit.limitCents}
                />
              )
            })}
          </CardContent>
        </Card>
      )}

      {goal && (
        <BudgetAdjustmentDialog
          goalId={goal.id}
          open={showAdjustment}
          onClose={() => setShowAdjustment(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/budgets/spending/
git commit -m "feat(budget): add spending goals page with progress bars"
```

---

### Task 6: Investment Goals Page

**Files:**
- Create: `apps/web/app/(app)/budgets/investing/page.tsx`
- Create: `apps/web/app/(app)/budgets/investing/client.tsx`

- [ ] **Step 1: Create investing page (server component)**

Create `apps/web/app/(app)/budgets/investing/page.tsx`:

```typescript
import { getOrgId } from '@/lib/finance/queries'
import { getPositions } from '@/lib/investments/queries'
import { getBudgetGoals, getInvestmentContributions, getAdjustmentTotal, getCurrentPeriodRange } from '@/lib/finance/budget-queries'
import { InvestingGoalClient } from './client'

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export default async function InvestingGoalsPage() {
  const orgId = await getOrgId()
  const goals = await getBudgetGoals(orgId, 'investing')
  const goal = goals[0]

  if (!goal) {
    return <InvestingGoalClient goal={null} contributed={0} patrimony={0} periodLabel="" />
  }

  const { start, end } = getCurrentPeriodRange(goal.period)
  const [contributed, adjustmentTotal, positions] = await Promise.all([
    getInvestmentContributions(orgId, start, end),
    getAdjustmentTotal(goal.id, start, end),
    getPositions(orgId),
  ])

  const totalContributed = contributed + adjustmentTotal

  // Sum current patrimony from positions (quantity * avgPrice as approximation)
  const patrimony = positions.reduce((sum: number, p: any) => {
    return sum + Math.abs(p.quantity * (p.avgPriceCents ?? 0))
  }, 0)

  const periodLabel = PERIOD_LABELS[goal.period] ?? goal.period

  return (
    <InvestingGoalClient
      goal={{
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        period: goal.period,
        patrimonyTargetCents: goal.patrimonyTargetCents,
        patrimonyDeadline: goal.patrimonyDeadline,
      }}
      contributed={totalContributed}
      patrimony={patrimony}
      periodLabel={periodLabel}
    />
  )
}
```

- [ ] **Step 2: Create investing client component**

Create `apps/web/app/(app)/budgets/investing/client.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/components/finance/budget-progress-bar'
import { BudgetGoalForm } from '@/components/finance/budget-goal-form'
import { BudgetAdjustmentDialog } from '@/components/finance/budget-adjustment-dialog'
import { formatBRL } from '@floow/core-finance'
import { Plus, Pencil, SlidersHorizontal } from 'lucide-react'

interface InvestingGoalClientProps {
  goal: {
    id: string; name: string; targetCents: number; period: string
    patrimonyTargetCents?: number | null; patrimonyDeadline?: Date | null
  } | null
  contributed: number
  patrimony: number
  periodLabel: string
}

export function InvestingGoalClient({ goal, contributed, patrimony, periodLabel }: InvestingGoalClientProps) {
  const [showForm, setShowForm] = useState(false)
  const [showAdjustment, setShowAdjustment] = useState(false)

  if (!goal && !showForm) {
    return (
      <div className="space-y-4">
        <PageHeader title="Meta de Investimentos" description="Defina metas de aporte e patrimônio" />
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <p className="text-gray-500">Nenhuma meta de investimentos configurada.</p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Criar meta
          </Button>
        </div>
      </div>
    )
  }

  if (showForm) {
    return (
      <div className="space-y-4">
        <PageHeader title={goal ? 'Editar Meta de Investimentos' : 'Criar Meta de Investimentos'} />
        <Card>
          <CardContent className="pt-6">
            <BudgetGoalForm
              type="investing"
              goal={goal ?? undefined}
              onClose={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Patrimony projection
  let projectionText = ''
  if (goal!.patrimonyTargetCents && goal!.patrimonyTargetCents > patrimony) {
    const remaining = goal!.patrimonyTargetCents - patrimony
    const monthlyRate = goal!.targetCents > 0 ? goal!.targetCents : 1
    const monthsToGoal = Math.ceil(remaining / monthlyRate)
    projectionText = `No ritmo atual, você atinge a meta em ~${monthsToGoal} meses`
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Meta de Investimentos" description={`Período: ${periodLabel}`}>
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar meta
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowAdjustment(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Ajuste manual
        </Button>
      </PageHeader>

      {/* Periodic contribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{goal!.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetProgressBar
            label="Aporte no período"
            currentCents={contributed}
            limitCents={goal!.targetCents}
            invertColors
          />
        </CardContent>
      </Card>

      {/* Patrimony target */}
      {goal!.patrimonyTargetCents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta de Patrimônio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BudgetProgressBar
              label="Patrimônio investido"
              currentCents={patrimony}
              limitCents={goal!.patrimonyTargetCents}
              invertColors
            />
            {goal!.patrimonyDeadline && (
              <p className="text-xs text-gray-500">
                Prazo: {new Date(goal!.patrimonyDeadline).toLocaleDateString('pt-BR')}
              </p>
            )}
            {projectionText && (
              <p className="text-xs text-blue-600 font-medium">{projectionText}</p>
            )}
          </CardContent>
        </Card>
      )}

      {goal && (
        <BudgetAdjustmentDialog
          goalId={goal.id}
          open={showAdjustment}
          onClose={() => setShowAdjustment(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(app\)/budgets/investing/
git commit -m "feat(budget): add investment goals page with contribution and patrimony tracking"
```

---

### Task 7: Sidebar Navigation

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx`

- [ ] **Step 1: Add PiggyBank import and Orçamento section**

In `sidebar.tsx`, add `PiggyBank` to the lucide-react import:

```typescript
import { ..., PiggyBank } from 'lucide-react'
```

Then insert the "Orçamento" section after "Dia a dia" in `NAV_SECTIONS`:

```typescript
{
  title: 'Orçamento',
  items: [
    { href: '/budgets/spending', label: 'Meta de Gastos', icon: PiggyBank },
    { href: '/budgets/investing', label: 'Meta de Investimentos', icon: Target },
  ],
},
```

Note: `Target` is already imported. Use `PiggyBank` for spending and `Target` for investing to differentiate visually. The section goes at index 2 (after "Dia a dia", before "Investimentos").

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx
git commit -m "feat(budget): add Orçamento section to sidebar navigation"
```

---

### Task 8: Dashboard Alert Card

**Files:**
- Create: `apps/web/components/finance/budget-alert-card.tsx`
- Modify: `apps/web/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create BudgetAlertCard**

Create `apps/web/components/finance/budget-alert-card.tsx`:

```typescript
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBRL } from '@floow/core-finance'

interface AlertItem {
  name: string
  currentCents: number
  limitCents: number
  href: string
}

interface BudgetAlertCardProps {
  alerts: AlertItem[]
}

export function BudgetAlertCard({ alerts }: BudgetAlertCardProps) {
  if (alerts.length === 0) return null

  return (
    <Card className="border-yellow-200 bg-yellow-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-4 w-4" />
          Metas em Risco
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map((alert) => {
            const pct = alert.limitCents > 0 ? Math.round((alert.currentCents / alert.limitCents) * 100) : 0
            return (
              <Link
                key={alert.name}
                href={alert.href}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-yellow-100 transition-colors"
              >
                <span className="font-medium text-gray-800">{alert.name}</span>
                <span className="text-yellow-700">
                  {formatBRL(alert.currentCents)} de {formatBRL(alert.limitCents)} — {pct}%
                </span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add alert section to dashboard**

In `apps/web/app/(app)/dashboard/page.tsx`, add a new async section:

```typescript
import { BudgetAlertCard } from '@/components/finance/budget-alert-card'
import { getBudgetGoals, getSpendingByCategory, getInvestmentContributions, getAdjustmentTotal, getCurrentPeriodRange } from '@/lib/finance/budget-queries'
```

Add a new `BudgetAlertSection` async component:

```typescript
async function BudgetAlertSection({ orgId }: { orgId: string }) {
  const [spendingGoals, investingGoals] = await Promise.all([
    getBudgetGoals(orgId, 'spending'),
    getBudgetGoals(orgId, 'investing'),
  ])

  const alerts: { name: string; currentCents: number; limitCents: number; href: string }[] = []

  // Check spending goals
  for (const goal of spendingGoals) {
    const { start, end } = getCurrentPeriodRange(goal.period)
    const [spending, adj] = await Promise.all([
      getSpendingByCategory(orgId, start, end),
      getAdjustmentTotal(goal.id, start, end),
    ])
    const totalSpent = spending.reduce((sum, s) => sum + Number(s.spent), 0) + adj
    const pct = goal.targetCents > 0 ? (totalSpent / goal.targetCents) * 100 : 0
    if (pct >= 80) {
      alerts.push({ name: goal.name, currentCents: totalSpent, limitCents: goal.targetCents, href: '/budgets/spending' })
    }
  }

  // Check investing goals — alert if behind pace
  for (const goal of investingGoals) {
    const { start, end } = getCurrentPeriodRange(goal.period)
    const [contributed, adj] = await Promise.all([
      getInvestmentContributions(orgId, start, end),
      getAdjustmentTotal(goal.id, start, end),
    ])
    const totalContributed = contributed + adj
    const now = new Date()
    const periodStart = start
    const periodEnd = end
    const totalDays = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
    const elapsedDays = Math.max(1, (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24))
    const expectedPct = (elapsedDays / totalDays) * 100
    const actualPct = goal.targetCents > 0 ? (totalContributed / goal.targetCents) * 100 : 0
    if (actualPct < expectedPct * 0.8) {
      alerts.push({ name: goal.name, currentCents: totalContributed, limitCents: goal.targetCents, href: '/budgets/investing' })
    }
  }

  return <BudgetAlertCard alerts={alerts} />
}
```

Then add it to the JSX in `DashboardPage`, after StatsSection:

```tsx
<Suspense fallback={null}>
  <BudgetAlertSection orgId={orgId} />
</Suspense>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/finance/budget-alert-card.tsx apps/web/app/\(app\)/dashboard/page.tsx
git commit -m "feat(budget): add at-risk budget alerts to dashboard"
```

---

### Task 9: Final Integration Test + Push

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json`

Fix any type errors in budget files.

- [ ] **Step 2: Manual smoke test**

1. Navigate to `/budgets/spending` — should show empty state with "Criar meta" button
2. Create a spending goal — should show progress bar at 0%
3. Navigate to `/budgets/investing` — same empty state flow
4. Create an investing goal with patrimony target
5. Check dashboard — alert card should appear if goals are at risk

- [ ] **Step 3: Push all commits**

```bash
git push
```
