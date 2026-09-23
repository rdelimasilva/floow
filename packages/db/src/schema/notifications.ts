import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

/**
 * Último status de ritmo enviado por e-mail, por categoria e mês.
 *
 * Existe para o e-mail sair só quando o status piora. Sem policy de RLS: só o
 * cron lê e escreve (ver 00050_alerta_ritmo_por_email.sql).
 */
export const pacingAlertState = pgTable(
  'pacing_alert_state',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** YYYY-MM */
    month: text('month').notNull(),
    categoryId: uuid('category_id').notNull(),
    /** 'risco' | 'estourado' */
    status: text('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.month, table.categoryId] }),
  }),
)
