import { pgTable, uuid, text, integer, boolean, timestamp, index, date } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories, transactionTypeEnum, accounts } from './finance'

// ---------------------------------------------------------------------------
// Categorization Rules
// ---------------------------------------------------------------------------

/**
 * Drizzle table object for category_rules.
 * The SQL table was created in migration 00006_automation.sql.
 * Rules apply to transactions automatically when category_id IS NULL.
 */
export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
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
    idxRecurringTemplatesNextDueDate: index('idx_recurring_templates_next_due_date').on(
      table.nextDueDate
    ),
  })
)

export type RecurringTemplate = typeof recurringTemplates.$inferSelect
export type NewRecurringTemplate = typeof recurringTemplates.$inferInsert
// Aliases expected by plan consumers (07-01 must_haves)
export type RecurringTemplateRow = RecurringTemplate
export type NewRecurringTemplateRow = NewRecurringTemplate
