import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { orgs } from './auth'
import { transactions } from './finance'

/**
 * Par de lançamentos que a fonte entregou duas vezes, proposto ao usuário.
 *
 * `status` é `text` com CHECK no banco (migration 00049) e não um enum do
 * Postgres, pelo mesmo motivo de `forecast_match_proposals`: enum novo exigiria
 * `ALTER TYPE` a cada estado futuro, e declarar um enum Drizzle aqui criaria
 * discrepância com o banco. O `$type<...>` é só inferência TypeScript.
 *
 * Ver packages/core-finance/src/openfinance/duplicata.ts para o sinal que
 * distingue duplicata de compra repetida legítima.
 */
export const duplicateProposals = pgTable(
  'duplicate_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** O que fica: a versão que conhece a contraparte, ou a emitida primeiro. */
    manterTransactionId: uuid('manter_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** O reemitido, candidato a sair. */
    duplicataTransactionId: uuid('duplicata_transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** Distância entre as emissões: é ela que justifica a proposta na tela. */
    minutosEntreEmissoes: integer('minutos_entre_emissoes').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'refused'>().notNull().default('pending'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => ({
    idxOrgStatus: index('idx_dp_org_status').on(table.orgId, table.status),
    uqPar: uniqueIndex('uq_dp_par').on(table.manterTransactionId, table.duplicataTransactionId),
    uqDuplicataPendente: uniqueIndex('uq_dp_duplicata_pendente')
      .on(table.duplicataTransactionId)
      .where(sql`status = 'pending'`),
  }),
)

export type DuplicateProposal = typeof duplicateProposals.$inferSelect
export type NewDuplicateProposal = typeof duplicateProposals.$inferInsert
