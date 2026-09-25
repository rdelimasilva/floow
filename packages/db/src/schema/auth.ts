import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
  primaryKey,
  boolean,
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
  /** Portão da fila de revisão: setado na primeira vez que a org zera a fila. */
  reviewGateClearedAt: timestamp('review_gate_cleared_at', { withTimezone: true }),
})

export const profiles = pgTable('profiles', {
  // id references auth.users(id) — 1:1 mapping, NOT defaultRandom()
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  /** OBSOLETA desde 00065 — a preferência vive em notification_preferences. */
  emailPacingAlerts: boolean('email_pacing_alerts').notNull().default(true),
  /** WhatsApp em E.164 (+5511999998888). Só vale com whatsappVerifiedAt preenchido. */
  whatsappPhone: text('whatsapp_phone'),
  whatsappVerifiedAt: timestamp('whatsapp_verified_at', { withTimezone: true }),
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

/**
 * Trilha de auditoria: quem fez o quê, sobre qual recurso, em que org.
 *
 * Append-only. Não existe caminho de UPDATE/DELETE no app, e o RLS não dá
 * policy de escrita ao cliente (ver 00043_security_hardening.sql).
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  /** Sem FK para auth.users: a trilha sobrevive à exclusão da conta. */
  actorUserId: uuid('actor_user_id'),
  /** Ex.: 'transactions.export', 'openfinance.connection.create'. */
  action: text('action').notNull(),
  /** Ex.: 'transactions', 'counterparties'. */
  resource: text('resource'),
  /** Volume lido ou afetado, quando faz sentido contar. */
  resourceCount: integer('resource_count'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * Contador de janela fixa para travas de uso (ver lib/rate-limit/consume.ts).
 *
 * Infraestrutura, não dado do usuário: RLS ligado e sem policy nenhuma, então
 * nada acessa pelo PostgREST.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    /** Família do limite, ex.: 'cfo.chat'. */
    bucket: text('bucket').notNull(),
    /** Quem está sendo limitado — org_id ou user_id. */
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.bucket, table.subject, table.windowStart] }),
  }),
)
