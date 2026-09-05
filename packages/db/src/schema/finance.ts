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
  primaryKey,
} from 'drizzle-orm/pg-core'
import { orgs } from './auth'
// NÃO importar de './counterparty' aqui: counterparty.ts importa
// `transactionTypeEnum` deste arquivo eagerly (dentro do próprio pgTable), e
// import circular em ESM deadlocka nesse valor não estar pronto ainda —
// verificado em runtime (vitest), não é só teórico. O FK real já existe no
// banco (migração 00035); `counterpartyId` abaixo fica sem `.references()` do
// lado do Drizzle por isso.

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

/**
 * 'pending': natureza da transação ainda não confirmada pelo usuário (fila de
 * revisão por contraparte). Definido aqui, junto de `transactionTypeEnum`, e
 * não em `counterparty.ts`, para não criar import circular (ver nota acima).
 */
export const reviewStateEnum = pgEnum('review_state', ['confirmed', 'pending'])

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
    /**
     * Categoria pai. A taxonomia da Polp tem dois níveis
     * (FOOD_AND_DRINK -> FOOD_AND_DRINK_GROCERIES); com parent_id o usuário
     * pode orçar na raiz, somando tudo abaixo, ou numa filha específica.
     */
    parentId: uuid('parent_id'),
    /** Valor do enum TransactionCategory da Polp, quando a categoria vem da taxonomia. */
    polpRef: text('polp_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxCategoriesOrgId: index('idx_categories_org_id').on(table.orgId),
    idxCategoriesParentId: index('idx_categories_parent_id').on(table.parentId),
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
    /** Parcela atual. Recebe charge_identificator na ingestão Open Finance. */
    installmentNumber: integer('installment_number'),
    /** Total de parcelas. Recebe charge_number na ingestão Open Finance. */
    installmentTotal: integer('installment_total'),
    // -- Open Finance (migration 00027) -------------------------------------
    /**
     * Data de lançamento na fatura do cartão. NULL enquanto não faturada.
     * A Polp envia a sentinela '0001-01-01' nesse caso; a ingestão converte
     * para NULL — gravá-la crua jogaria o lançamento para o ano 1.
     */
    billPostDate: date('bill_post_date', { mode: 'date' }),
    /** Mês/ano de faturamento previsto (AAAA-MM), inclusive para parcelas futuras. */
    billForecastMonth: text('bill_forecast_month'),
    /** Merchant Category Code, desempate quando category_ref é genérico. */
    payeeMcc: integer('payee_mcc'),
    /** Valor cru do enum TransactionCategory da Polp. */
    categoryRef: text('category_ref'),
    /**
     * `type` cru da Polp (AccountTransactionType), sinal estrutural do detector
     * de suspeitas. Null em lançamento manual e em transação de cartão.
     */
    polpType: text('polp_type'),
    /**
     * FK para a contraparte que decidiu a natureza (Nível 2). Null no Nível 1.
     * Sem `.references()` do lado do Drizzle — ver nota de import circular no
     * topo do arquivo. O REFERENCES real já existe no banco (migração 00035).
     */
    counterpartyId: uuid('counterparty_id'),
    /** Snapshot do CNPJ/CPF no momento da ingestão — sobrevive ao re-sync sobrescrever a descrição. */
    counterpartyTaxId: text('counterparty_tax_id'),
    /** Snapshot do nome que a Polp mandou para a contraparte. */
    counterpartyName: text('counterparty_name'),
    /**
     * 'pending': natureza ainda não confirmada pelo usuário, fora das somas de
     * orçamento/pacing/dívida. Nunca derivado de counterparties.confirmedAt —
     * gravado, para que o único lugar que possa divergir seja a ação de
     * confirmar.
     */
    reviewState: reviewStateEnum('review_state').notNull().default('confirmed'),
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
    idxTransactionsOrgDate: index('idx_transactions_org_date').on(table.orgId, table.date),
    idxTransactionsOrgCategory: index('idx_transactions_org_category').on(table.orgId, table.categoryId),
    idxTransactionsOrgBalanceDate: index('idx_transactions_org_balance_date').on(table.orgId, table.balanceApplied, table.date),
    idxTransactionsOrgReviewState: index('idx_transactions_org_review_state').on(table.orgId, table.reviewState),
    idxTransactionsCounterpartyId: index('idx_transactions_counterparty_id').on(table.counterpartyId),
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

/**
 * Categorias de sistema que uma org escolheu nao ver.
 *
 * A linha original (org_id IS NULL) e compartilhada por todas as orgs, entao
 * excluir para atender uma delas apagaria a categoria das outras. Esconder e a
 * unica exclusao que nao vaza para o vizinho.
 */
export const hiddenSystemCategories = pgTable(
  'hidden_system_categories',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.categoryId] }),
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
