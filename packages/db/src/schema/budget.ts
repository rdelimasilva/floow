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

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const budgetGoalTypeEnum = pgEnum('budget_goal_type', ['spending', 'investing'])

export const budgetPeriodEnum = pgEnum('budget_period', [
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
])

// ---------------------------------------------------------------------------
// Tables — Budget Goals (Phase 7)
// ---------------------------------------------------------------------------

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

export const budgetEntries = pgTable(
  'budget_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('spending'), // 'spending' | 'investing'
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' }), // nullable for investing
    name: text('name'), // label for investing entries (e.g. "Aporte mensal")
    plannedCents: integer('planned_cents').notNull(),
    startMonth: date('start_month', { mode: 'date' }).notNull(),
    endMonth: date('end_month', { mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxBudgetEntriesOrgType: index('idx_budget_entries_org_type').on(table.orgId, table.type),
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

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type BudgetGoal = typeof budgetGoals.$inferSelect
export type NewBudgetGoal = typeof budgetGoals.$inferInsert

export type BudgetEntry = typeof budgetEntries.$inferSelect
export type NewBudgetEntry = typeof budgetEntries.$inferInsert

export type BudgetAdjustment = typeof budgetAdjustments.$inferSelect
export type NewBudgetAdjustment = typeof budgetAdjustments.$inferInsert
