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
  date,
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
    /**
     * Rotulo curto para a tela, ex.: "Cartao · Platinum · final 1234". Sempre
     * preenchido: o ultimo elo da cadeia usa o fim do resource_id, entao duas
     * contas do mesmo banco nunca aparecem com o mesmo nome.
     */
    displayLabel: text('display_label'),
    /** Quatro ultimos digitos apenas — o numero completo nao e armazenado. */
    identificationDigits: text('identification_digits'),
    /** detail | transaction | fallback — de qual elo da cadeia veio. */
    identificationSource: text('identification_source'),
    /**
     * Data minima de transacao a importar na primeira sincronizacao.
     *
     * Existe para nao duplicar o que a conta ja tem de outra origem: o dedupe e
     * por (external_id, account_id), e o external_id de um OFX e o FITID do
     * banco, sem relacao com o id da Polp. NULL importa todo o historico.
     */
    syncFromDate: date('sync_from_date', { mode: 'string' }),
    /** Chaves vistas no payload do detalhe, sem valores. Diagnostico da forma. */
    detailKeys: text('detail_keys').array(),
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

/**
 * Itens que a ingestao nao conseguiu normalizar.
 *
 * O normalizador levanta erro em valor ou data que nao reconhece — virar NaN em
 * silencio poria numero errado no saldo. Antes esse erro derrubava a pagina
 * inteira de 500 transacoes; agora o lote entra e o que sobrou fica aqui, com o
 * payload cru, para diagnostico e reimportacao.
 */
export const openfinanceIngestionIssues = pgTable(
  'openfinance_ingestion_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Recurso de origem. SET NULL para a trilha sobreviver a revogacao. */
    resourceId: uuid('resource_id').references(() => openfinanceResources.id, {
      onDelete: 'set null',
    }),
    /** `id` da transacao na Polp, quando o payload traz um reconhecivel. */
    externalId: text('external_id'),
    reason: text('reason').notNull(),
    payload: jsonb('payload').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgCreated: index('idx_openfinance_issues_org_created').on(table.orgId, table.createdAt),
    idxReason: index('idx_openfinance_issues_reason').on(table.reason),
  })
)
