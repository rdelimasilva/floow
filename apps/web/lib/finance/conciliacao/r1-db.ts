import { forecastMatchProposals, type getDb } from '@floow/db'
import type { ParConciliado } from '@floow/core-finance'
import { absorverNoBanco } from './absorver'
import { buscarProvisorias, paresDoR1 } from './r1-candidatos'

type Db = ReturnType<typeof getDb>

/**
 * R1 — extrato × aguardando. Absorve o par único; propõe o ambíguo em
 * `forecast_match_proposals`, onde o usuário decide em "Confirmar
 * previsões" como hoje. Quem chama segura o lock da conta.
 *
 * Candidatos e regra em `r1-candidatos.ts`, os mesmos que
 * `reclassificarConta` usa para decidir se a linha antiga tem prova.
 */
export async function aplicarR1(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<{ absorvidas: ParConciliado[]; propostas: number }> {
  const aguardando = await buscarProvisorias(db, orgId, accountId)
  const { absorver, propor } = await paresDoR1(db, orgId, accountId, aguardando)

  const absorvidas: ParConciliado[] = []
  for (const par of absorver) {
    if (await absorverNoBanco(db, orgId, par)) absorvidas.push(par)
  }

  let propostas = 0
  for (const par of propor) {
    // `onConflictDoNothing`: par já decidido (`uq_fmp_par`) ou ponta com
    // outra proposta pendente — não é erro, a próxima passada tenta de novo.
    const inserida = await db
      .insert(forecastMatchProposals)
      .values({ orgId, forecastTransactionId: par.aguardandoId, realizedTransactionId: par.extratoId, status: 'pending' })
      .onConflictDoNothing()
      .returning({ id: forecastMatchProposals.id })
    if (inserida.length > 0) propostas++
  }

  return { absorvidas, propostas }
}
