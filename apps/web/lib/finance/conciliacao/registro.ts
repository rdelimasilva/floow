import { forecastMatchProposals, type getDb } from '@floow/db'

type Db = ReturnType<typeof getDb>

export type Decisao = 'usuario' | 'automatico'

/**
 * O registro de um vínculo previsão → realizado: a proposta APROVADA do par.
 * Desde a 00073 o banco recusa no COMMIT o `matched_transaction_id` sem ela,
 * então todo caminho que grava o vínculo chama isto na mesma transação.
 *
 * Upsert no par (`uq_fmp_par`): se já havia proposta — pendente, ou recusada
 * e reaberta por `desconciliar` —, ela passa a aprovada; senão nasce.
 */
export async function registrarVinculo(db: Db, orgId: string, previsaoId: string, realizadoId: string, decisao: Decisao): Promise<void> {
  const decidedAt = new Date()
  await db
    .insert(forecastMatchProposals)
    .values({ orgId, forecastTransactionId: previsaoId, realizedTransactionId: realizadoId, status: 'approved', decisao, decidedAt })
    .onConflictDoUpdate({
      target: [forecastMatchProposals.forecastTransactionId, forecastMatchProposals.realizedTransactionId],
      set: { status: 'approved', decisao, decidedAt },
    })
}
