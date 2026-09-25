import { pgTable, uuid, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { orgs } from './auth'

export type NotificationChannel = 'email' | 'whatsapp'
export type NotificationFrequency = 'daily' | 'weekly' | 'alerts' | 'off'

/**
 * Último status de ritmo enviado, por categoria, mês e canal.
 *
 * Existe para o alerta sair só quando o status piora. Por canal para que a
 * falha de um não faça o outro repetir. Sem policy de RLS: só o cron lê e
 * escreve (ver 00051 e 00065).
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
    channel: text('channel').$type<NotificationChannel>().notNull().default('email'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.month, table.categoryId, table.channel] }),
  }),
)

/**
 * Frequência do aviso de ritmo por org × usuário × canal. Linha ausente = padrão
 * (ver DEFAULT_FREQUENCY em apps/web/lib/notifications/schedule.ts).
 */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    channel: text('channel').$type<NotificationChannel>().notNull(),
    frequency: text('frequency').$type<NotificationFrequency>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId, table.channel] }),
  }),
)

/** Código pendente de verificação do WhatsApp. Sem policy de RLS: só o backend. */
export const whatsappVerifications = pgTable('whatsapp_verifications', {
  userId: uuid('user_id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
