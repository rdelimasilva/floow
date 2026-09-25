import { pgTable, uuid, date, bigint, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

/** Gasto com o Claude por org e mês, em micro-dólares (00062). */
export const llmUsage = pgTable(
  'llm_usage',
  {
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** Primeiro dia do mês, fuso de São Paulo. */
    month: date('month').notNull(),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull().default(0),
    calls: integer('calls').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.month] }),
  }),
)
