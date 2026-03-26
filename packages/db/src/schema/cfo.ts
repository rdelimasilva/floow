import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'

export const cfoInsights = pgTable(
  'cfo_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    category: text('category').notNull(),
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    detailMarkdown: text('detail_markdown'),
    metric: jsonb('metric').notNull().default(sql`'{}'`),
    correlatedWith: text('correlated_with').array(),
    suggestedActionType: text('suggested_action_type'),
    suggestedActionParams: jsonb('suggested_action_params'),
    source: text('source').notNull().default('cron'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    actedOnAt: timestamp('acted_on_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgActive: index('idx_cfo_insights_org_active').on(
      table.orgId,
      table.severity,
      table.generatedAt,
    ),
  })
)

export const cfoRuns = pgTable(
  'cfo_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    runType: text('run_type').notNull(),
    triggerEvent: text('trigger_event').notNull().default('cron_daily'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    analyzersRun: text('analyzers_run').array().notNull(),
    insightsGenerated: integer('insights_generated').default(0),
    llmCalled: boolean('llm_called').default(false),
    llmTokensUsed: integer('llm_tokens_used'),
    dailySummary: text('daily_summary'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgLatest: index('idx_cfo_runs_org_latest').on(
      table.orgId,
      table.runType,
      table.startedAt,
    ),
  })
)

export const cfoConversations = pgTable(
  'cfo_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    title: text('title'),
    insightId: uuid('insight_id').references(() => cfoInsights.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrg: index('idx_cfo_conversations_org').on(table.orgId, table.updatedAt),
  })
)

export const cfoMessages = pgTable(
  'cfo_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => cfoConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    toolCall: jsonb('tool_call'),
    toolResult: jsonb('tool_result'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxConversation: index('idx_cfo_messages_conversation').on(table.conversationId, table.createdAt),
  })
)

export type CfoInsight = typeof cfoInsights.$inferSelect
export type NewCfoInsight = typeof cfoInsights.$inferInsert
export type CfoRun = typeof cfoRuns.$inferSelect
export type NewCfoRun = typeof cfoRuns.$inferInsert
export type CfoConversation = typeof cfoConversations.$inferSelect
export type NewCfoConversation = typeof cfoConversations.$inferInsert
export type CfoMessage = typeof cfoMessages.$inferSelect
export type NewCfoMessage = typeof cfoMessages.$inferInsert
