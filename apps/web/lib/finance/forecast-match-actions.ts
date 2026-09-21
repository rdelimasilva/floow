'use server'

import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq, inArray } from 'drizzle-orm'
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
 * Antes de gravar, RECONFERE as duas pontas. A janela entre propor e aprovar
 * é aberta por desenho (a fila não bloqueia o app) e nela o usuário mexe nos
 * dois lados: se o realizado foi marcado como ignorado,
 * `toggleIgnoreTransaction` já reverteu `accounts.balance_cents` em
 * `-amountCents`, e aprovar em seguida daria vínculo à previsão — tirando-a
 * do saldo projetado — com o realizado já fora do saldo da conta. O
 * lançamento desapareceria dos DOIS saldos, com a previsão exibindo o selo
 * "conciliado" cujo título afirma que quem soma é o realizado.
 *
 * `getPropostasPendentes` já tira essa proposta da fila; a reconferência aqui
 * é a segunda ponta da mesma defesa, porque a fila é uma página renderizada e
 * o clique chega depois dela.
 *
 * Devolve `efetivada: false` quando a proposta não está mais pendente ou
 * quando uma ponta ficou inelegível — dois cliques, duas abas, o realizado
 * ignorado, a ponta apagada. Nenhum deles é erro, e a fila diz o mesmo nos
 * dois casos: não vale mais.
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

    // As duas pontas em uma consulta. `inArray` e não dois joins com alias
    // porque o que importa aqui é o estado de cada linha, e o filtro por org
    // fecha o caminho de um vínculo antigo apontar para fora da org —
    // `getDb()` ignora as policies de RLS.
    const pontas = await tx
      .select({
        id: transactions.id,
        matchedTransactionId: transactions.matchedTransactionId,
        balanceApplied: transactions.balanceApplied,
        isIgnored: transactions.isIgnored,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          inArray(transactions.id, [
            proposta.forecastTransactionId,
            proposta.realizedTransactionId,
          ]),
        ),
      )

    const previsao = pontas.find((p) => p.id === proposta.forecastTransactionId)
    const realizado = pontas.find((p) => p.id === proposta.realizedTransactionId)

    // Ponta apagada (o CASCADE da 00047 levaria a proposta, mas a leitura e a
    // escrita desta transação não são o mesmo instante para quem clicou).
    if (!previsao || !realizado) return false

    // Previsão que já ganhou vínculo, previsão que virou realizada, realizado
    // marcado como ignorado: em todos, o par não existe mais como o sync o
    // propôs.
    if (previsao.matchedTransactionId || previsao.balanceApplied || realizado.isIgnored) {
      return false
    }

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
