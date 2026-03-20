import { pgTable, uuid, text, integer, date, boolean, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export const fixedAssetTypes = pgTable(
  'fixed_asset_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_fixed_asset_types_org_id').on(table.orgId),
  })
)

export const fixedAssets = pgTable(
  'fixed_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => fixedAssetTypes.id),
    name: text('name').notNull(),
    purchaseValueCents: integer('purchase_value_cents').notNull(),
    purchaseDate: date('purchase_date', { mode: 'date' }).notNull(),
    currentValueCents: integer('current_value_cents').notNull(),
    currentValueDate: date('current_value_date', { mode: 'date' }).notNull(),
    annualRate: numeric('annual_rate', { precision: 7, scale: 4 }).notNull(),
    address: text('address'),
    licensePlate: text('license_plate'),
    model: text('model'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_fixed_assets_org_id').on(table.orgId),
  })
)

export type FixedAssetType = typeof fixedAssetTypes.$inferSelect
export type NewFixedAssetType = typeof fixedAssetTypes.$inferInsert
export type FixedAsset = typeof fixedAssets.$inferSelect
export type NewFixedAsset = typeof fixedAssets.$inferInsert
