/**
 * Ingestão Open Finance via Polp (Celcoin v2).
 * Ver docs/superpowers/specs/2026-09-02-openfinance-ingestion-design.md
 *
 * A API da Polp não é multi-tenant — uma credencial por conta e webhooks que
 * trazem apenas um resource_id. Estas tabelas existem para que o floow saiba de
 * qual org é cada dado que chega, antes de aceitá-lo.
 */
import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { accounts } from './finance'

/** Um consentimento Open Finance. Sempre de um CPF. */
export const openfinanceConnections = pgTable(
  'openfinance_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Quem conectou. A org é a família e vê o consolidado. */
    ownerUserId: uuid('owner_user_id'),
    polpConsentId: text('polp_consent_id').notNull(),
    institutionId: text('institution_id').notNull(),
    institutionName: text('institution_name'),
    /** SHA-256 do CPF com salt. O CPF em claro nunca é armazenado. */
    cpfHash: text('cpf_hash').notNull(),
    cpfMasked: text('cpf_masked').notNull(),
    /** ConsentStatus: AWAITING_AUTHORIZATION | AUTHORISED | REJECTED | EXPIRED */
    status: text('status').notNull(),
    /** ConsentExecutionStatus: AWAITING_RESOURCES | SUCCESS | PARTIAL_SUCCESS */
    executionStatus: text('execution_status'),
    flags: text('flags').array().notNull().default([]),
    products: text('products').array().notNull().default([]),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqConsent: uniqueIndex('uq_openfinance_connections_consent').on(table.polpConsentId),
    idxOrgStatus: index('idx_openfinance_connections_org_status').on(table.orgId, table.status),
  })
)

/** Uma conta ou cartão dentro de um consentimento. */
export const openfinanceResources = pgTable(
  'openfinance_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => openfinanceConnections.id, { onDelete: 'cascade' }),
    /**
     * UUID local da Polp. É a chave do roteamento de webhook: dado este id,
     * descobrimos a org. Único para que a resolução nunca seja ambígua.
     */
    polpResourceId: text('polp_resource_id').notNull(),
    /** ResourceType: ACCOUNT | CREDIT_CARD_ACCOUNT | LOAN | ... */
    resourceType: text('resource_type').notNull(),
    /** ResourceStatus: AVAILABLE | UNAVAILABLE | TEMPORARILY_UNAVAILABLE | PENDING_AUTHORISATION */
    status: text('status').notNull(),
    /** Conta espelho no floow. NULL até o usuário escolher vincular ou criar. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uqPolpId: uniqueIndex('uq_openfinance_resources_polp_id').on(table.polpResourceId),
    // Uma conta do floow espelha um recurso so; ver migration 00030.
    uqAccount: uniqueIndex('uq_openfinance_resources_account')
      .on(table.accountId)
      .where(sql`account_id IS NOT NULL`),
    idxOrgType: index('idx_openfinance_resources_org_type').on(table.orgId, table.resourceType),
    idxConnection: index('idx_openfinance_resources_connection').on(table.connectionId),
  })
)

/** Trilha de auditoria dos webhooks recebidos. */
export const openfinanceWebhookEvents = pgTable(
  'openfinance_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL quando o evento não pôde ser roteado — é o alarme de evento órfão. */
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id').notNull(),
    queryParams: text('query_params'),
    /** received | processed | rejected | failed */
    status: text('status').notNull().default('received'),
    rejectReason: text('reject_reason'),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxResource: index('idx_openfinance_webhook_resource').on(table.resourceId),
    idxStatus: index('idx_openfinance_webhook_status').on(table.status, table.createdAt),
  })
)
