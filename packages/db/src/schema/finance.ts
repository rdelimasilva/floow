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

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const accountTypeEnum = pgEnum('account_type', [
  'checking',
  'savings',
  'brokerage',
  'credit_card',
  'cash',
])

export const transactionTypeEnum = pgEnum('transaction_type', [
  'income',
  'expense',
  'transfer',
])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    balanceCents: integer('balance_cents').notNull().default(0),
    currency: text('currency').notNull().default('BRL'),
    branch: text('branch'),
    accountNumber: text('account_number'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxAccountsOrgId: index('idx_accounts_org_id').on(table.orgId),
  })
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // nullable — null means system-wide default category
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: transactionTypeEnum('type').notNull(),
    color: text('color'),
    icon: text('icon'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxCategoriesOrgId: index('idx_categories_org_id').on(table.orgId),
  })
)

export const transactions = pgTable(
  'transactions',
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
    date: date('date', { mode: 'date' }).notNull(),
    transferGroupId: uuid('transfer_group_id'),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    externalId: text('external_id'),
    isAutoCategorized: boolean('is_auto_categorized').notNull().default(false),
    isIgnored: boolean('is_ignored').notNull().default(false),
    // Recurring transaction tracking
    recurringTemplateId: uuid('recurring_template_id'),
    balanceApplied: boolean('balance_applied').notNull().default(true),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxTransactionsOrgAccountDate: index('idx_transactions_org_id').on(
      table.orgId,
      table.accountId,
      table.date
    ),
    // CRITICAL: Unique index for ON CONFLICT DO NOTHING import deduplication (Plan 02-03)
    // PostgreSQL treats NULLs as distinct in unique indexes — only non-null externalId rows are affected
    uqTransactionsExternalAccount: uniqueIndex('uq_transactions_external_account').on(
      table.externalId,
      table.accountId
    ),
  })
)

export const patrimonySnapshots = pgTable(
  'patrimony_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date', { mode: 'date' }).notNull(),
    netWorthCents: integer('net_worth_cents').notNull(),
    liquidAssetsCents: integer('liquid_assets_cents').notNull(),
    liabilitiesCents: integer('liabilities_cents').notNull().default(0),
    breakdown: text('breakdown'), // JSON stored as text
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxPatrimonySnapshotsOrgDate: index('idx_patrimony_snapshots_org_id').on(
      table.orgId,
      table.snapshotDate
    ),
  })
)

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type PatrimonySnapshot = typeof patrimonySnapshots.$inferSelect
export type NewPatrimonySnapshot = typeof patrimonySnapshots.$inferInsert
