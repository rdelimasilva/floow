import { pgTable, pgEnum, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { accounts, categories, transactionTypeEnum } from './finance'

export const counterpartyKeyTypeEnum = pgEnum('counterparty_key_type', ['tax_id', 'description'])
export const counterpartyDirectionEnum = pgEnum('counterparty_direction', ['in', 'out'])
// `reviewStateEnum` mora em `./finance` (junto de `transactionTypeEnum`), não
// aqui: este arquivo importa `transactionTypeEnum` de `finance.ts` eagerly, e
// se `finance.ts` importasse algo de volta daqui o ciclo deadlocka em runtime
// (ESM) porque um dos dois lados sempre executa antes do outro estar pronto.
export { reviewStateEnum } from './finance'

/**
 * Uma contraparte identificada por CNPJ/CPF ou, na ausência dele, pela
 * descrição do próprio banco — sempre com direção do dinheiro embutida na
 * chave, para que cobrança e reembolso da mesma entidade nunca colidam.
 *
 * Ver docs/superpowers/specs/2026-09-04-openfinance-counterparty-review-design.md
 */
export const counterparties = pgTable(
  'counterparties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    keyType: counterpartyKeyTypeEnum('key_type').notNull(),
    keyValue: text('key_value').notNull(),
    direction: counterpartyDirectionEnum('direction').notNull(),
    /** NULL para tax_id; obrigatório para description. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    /** NULL enquanto pendente. */
    nature: transactionTypeEnum('nature'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idxOrgId: index('idx_counterparties_org_id').on(table.orgId),
  }),
)

export type Counterparty = typeof counterparties.$inferSelect
export type NewCounterparty = typeof counterparties.$inferInsert
