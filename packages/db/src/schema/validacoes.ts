import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { transactions, categories } from './finance'
import { counterparties } from './counterparty'

export type AcaoDeValidacao = 'confirmar' | 'corrigir' | 'regra' | 'vinculo' | 'edicao' | 'legado'

/** Uma decisão de categoria sobre um lançamento. Ver migration 00074. */
export const validacoes = pgTable(
  'validacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    counterpartyId: uuid('counterparty_id').references(() => counterparties.id, { onDelete: 'set null' }),
    userId: uuid('user_id'),
    acao: text('acao').$type<AcaoDeValidacao>().notNull(),
    sugestaoCategoriaId: uuid('sugestao_categoria_id').references(() => categories.id, { onDelete: 'set null' }),
    sugestaoOrigem: text('sugestao_origem').$type<'historico' | 'claude'>(),
    natureza: text('natureza').$type<'income' | 'expense' | 'transfer'>().notNull(),
    categoriaId: uuid('categoria_id').references(() => categories.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porContraparte: index('idx_validacoes_contraparte').on(t.orgId, t.counterpartyId, t.createdAt),
  }),
)
