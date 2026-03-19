import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories } from './finance'

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
