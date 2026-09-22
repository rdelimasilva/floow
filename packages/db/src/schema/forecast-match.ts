import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'
import { transactions } from './finance'

/**
 * Par previsto×realizado que o sistema propõe e o usuário decide.
 *
 * `status` é `text` com CHECK no banco (migration 00047) e não um enum do
 * Postgres: um enum novo exigiria `ALTER TYPE` a cada estado futuro, e aqui
 * os três valores ('pending', 'approved', 'refused') são fechados por
 * desenho. Declarar enum Drizzle criaria discrepância — drizzle-kit tentaria
 * `CREATE TYPE`, e quem lesse o schema acreditaria num tipo que não existe no
 * banco. O `$type<...>` é puramente para inferência TypeScript.
 *
 * Ver docs/superpowers/specs/2026-09-21-forecast-match-approval-gate-design.md
 */
export const forecastMatchProposals = pgTable(
  'forecast_match_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** A previsão de template que espera confirmação. */
    forecastTransactionId: uuid('forecast_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** O lançamento do banco que o sistema acha que a cumpriu. */
    realizedTransactionId: uuid('realized_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    status: text('status').$type<'pending' | 'approved' | 'refused'>().notNull().default('pending'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => ({
    idxOrgStatus: index('idx_fmp_org_status').on(table.orgId, table.status),
    uqPar: uniqueIndex('uq_fmp_par').on(table.forecastTransactionId, table.realizedTransactionId),
    uqPrevisaoPendente: uniqueIndex('uq_fmp_previsao_pendente')
      .on(table.forecastTransactionId)
      .where(sql`status = 'pending'`),
    uqRealizadoPendente: uniqueIndex('uq_fmp_realizado_pendente')
      .on(table.realizedTransactionId)
      .where(sql`status = 'pending'`),
  }),
)

export type ForecastMatchProposal = typeof forecastMatchProposals.$inferSelect
export type NewForecastMatchProposal = typeof forecastMatchProposals.$inferInsert
