import { pgTable, uuid, text, integer, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { orgs } from './auth'
import { accounts } from './finance'

/**
 * Fatura fechada do cartão como o banco informa (Open Finance). Ver migration
 * 00077. O total vale mais que a soma dos lançamentos: a lista de transações
 * pode vir incompleta (agosto do Master Black: duas cobranças de R$ 50 que o
 * PDF tem e a Polp não).
 */
export const faturasDoBanco = pgTable(
  'faturas_do_banco',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    /** `bill_id` da Polp, o mesmo de `transactions.bill_id`. */
    billId: text('bill_id').notNull(),
    fechamento: date('fechamento', { mode: 'string' }).notNull(),
    vencimento: date('vencimento', { mode: 'string' }).notNull(),
    /** Convenção do floow: o que se deve é negativo. */
    totalCents: integer('total_cents').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porConta: uniqueIndex('uq_faturas_do_banco_conta_bill').on(t.accountId, t.billId),
  }),
)
