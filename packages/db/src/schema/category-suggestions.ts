import { pgTable, uuid, text, integer, bigint, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'
import { categories } from './finance'

/** Tabela criada na migration 00058_category_suggestions.sql. */
export const categorySuggestions = pgTable(
  'category_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().$type<'uncategorized' | 'split'>(),
    fingerprint: text('fingerprint').notNull(),
    suggestedName: text('suggested_name').notNull(),
    parentCategoryId: uuid('parent_category_id').references(() => categories.id, { onDelete: 'cascade' }),
    sourceCategoryIds: uuid('source_category_ids').array().notNull().default(sql`'{}'`),
    merchantKey: text('merchant_key').notNull(),
    matchValue: text('match_value'),
    txCount: integer('tx_count').notNull(),
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
    monthlyAvgCents: bigint('monthly_avg_cents', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending').$type<'pending' | 'accepted' | 'dismissed'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqOrgFingerprint: unique('category_suggestions_org_id_fingerprint_key').on(table.orgId, table.fingerprint),
    idxOrgStatus: index('idx_category_suggestions_org_status').on(table.orgId, table.status),
  }),
)

export type CategorySuggestionRow = typeof categorySuggestions.$inferSelect
export type NewCategorySuggestionRow = typeof categorySuggestions.$inferInsert
