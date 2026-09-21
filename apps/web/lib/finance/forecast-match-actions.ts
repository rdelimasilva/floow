'use server'

import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq } from 'drizzle-orm'
import { getOrgId } from './queries'
import { revalidateTransactionData } from './revalidate'

/**
 * Efetiva a conciliação proposta: a previsão passa a apontar para o lançamento
 * do banco que a cumpriu.
 *
 * Este é o ÚNICO caminho que grava `matched_transaction_id`. O sync só propõe
 * (ver `forecast-match-db.ts`), porque casar errado esconde um lançamento de
 * verdade e a decisão é do dono do dinheiro.
 *
 * As duas escritas vão na mesma transação de banco: meio caminho deixaria uma
 * previsão casada com a proposta ainda pendente, e a fila a mostraria de novo.
 *
 * Devolve `efetivada: false` quando a proposta não está mais pendente — dois
 * cliques, duas abas, ou o sync tendo apagado a ponta. Não é erro.
 */
export async function aprovarProposta(propostaId: string): Promise<{ efetivada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const efetivada = await db.transaction(async (tx) => {
    const [proposta] = await tx
      .select({
        id: forecastMatchProposals.id,
        forecastTransactionId: forecastMatchProposals.forecastTransactionId,
        realizedTransactionId: forecastMatchProposals.realizedTransactionId,
      })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.id, propostaId),
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .limit(1)

    if (!proposta) return false

    await tx
      .update(transactions)
      .set({ matchedTransactionId: proposta.realizedTransactionId })
      .where(
        and(
          eq(transactions.id, proposta.forecastTransactionId),
          eq(transactions.orgId, orgId),
        ),
      )

    await tx
      .update(forecastMatchProposals)
      .set({ status: 'approved', decidedAt: new Date() })
      .where(eq(forecastMatchProposals.id, proposta.id))

    return true
  })

  if (efetivada) revalidateTransactionData(orgId)

  return { efetivada }
}

/**
 * Recusa o par: não era o mesmo dinheiro.
 *
 * A previsão não é tocada — segue aberta, sem vínculo, elegível a outra
 * proposta no próximo sync. Quem garante que ESTE par não volta é o índice
 * único em (previsão, realizado) da migration 00047, combinado com o
 * `onConflictDoNothing` de quem propõe.
 */
export async function recusarProposta(propostaId: string): Promise<{ recusada: boolean }> {
  const orgId = await getOrgId()
  const db = getDb()

  const recusada = await db.transaction(async (tx) => {
    const [proposta] = await tx
      .select({ id: forecastMatchProposals.id })
      .from(forecastMatchProposals)
      .where(
        and(
          eq(forecastMatchProposals.id, propostaId),
          eq(forecastMatchProposals.orgId, orgId),
          eq(forecastMatchProposals.status, 'pending'),
        ),
      )
      .limit(1)

    if (!proposta) return false

    await tx
      .update(forecastMatchProposals)
      .set({ status: 'refused', decidedAt: new Date() })
      .where(eq(forecastMatchProposals.id, proposta.id))

    return true
  })

  if (recusada) revalidateTransactionData(orgId)

  return { recusada }
}
