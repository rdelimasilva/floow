import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

// Enums
export const orgTypeEnum = pgEnum('org_type', ['personal', 'business'])
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member', 'viewer'])

// Tables

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: orgTypeEnum('type').notNull().default('personal'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const profiles = pgTable('profiles', {
  // id references auth.users(id) — 1:1 mapping, NOT defaultRandom()
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    // userId references auth.users(id) — kept as raw uuid since auth.users is not in Drizzle schema
    userId: uuid('user_id').notNull(),
    role: memberRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Prevent duplicate memberships
    uniqueOrgUser: unique().on(table.orgId, table.userId),
  })
)

// Inferred TypeScript types
export type Org = typeof orgs.$inferSelect
export type NewOrg = typeof orgs.$inferInsert
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type OrgMember = typeof orgMembers.$inferSelect
export type NewOrgMember = typeof orgMembers.$inferInsert
