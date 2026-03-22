import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  index,
  date,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { categories } from './finance'

export const debts = pgTable(
  'debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'financing' | 'loan' | 'installment' | 'consortium'
    totalCents: integer('total_cents').notNull(),
    installments: integer('installments').notNull(),
    installmentCents: integer('installment_cents').notNull(),
    interestRate: numeric('interest_rate', { precision: 7, scale: 4 }),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxDebtsOrgActive: index('idx_debts_org_active').on(table.orgId, table.isActive),
  })
)

export type Debt = typeof debts.$inferSelect
export type NewDebt = typeof debts.$inferInsert
