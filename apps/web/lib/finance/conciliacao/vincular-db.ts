import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { aplicarEfeitoDaAbsorcao } from './absorver'
import { condicaoDaTransacaoDaOrg } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

/**
 * O vínculo previsão → lançamento do banco, com ou sem proposta prévia
 * (spec 2026-10-01 §5.1). Único gravador de `matched_transaction_id` fora do
 * motor R1. Reconfere as duas pontas: a tela é renderizada e o clique chega
 * depois — ver o docblock de `aprovarProposta` para o porquê de cada checagem.
 * Devolve `false` sem gravar nada quando o par deixou de valer.
 */
export async function vincularNoBanco(tx: Db, orgId: string, realizadoId: string, previsaoId: string): Promise<boolean> {
  const pontas = await tx
    .select({
      id: transactions.id, matchedTransactionId: transactions.matchedTransactionId, balanceApplied: transactions.balanceApplied,
      isIgnored: transactions.isIgnored, externalId: transactions.externalId, transferAccountId: transactions.transferAccountId,
      aguardaExtrato: transactions.aguardaExtrato, origem: transactions.origem, categoryId: transactions.categoryId,
      description: transactions.description, transferGroupId: transactions.transferGroupId, type: transactions.type,
      reviewState: transactions.reviewState,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, [previsaoId, realizadoId])))

  const previsao = pontas.find((p) => p.id === previsaoId)
  const realizado = pontas.find((p) => p.id === realizadoId)
  if (!previsao || !realizado) return false
  if (previsao.matchedTransactionId || previsao.balanceApplied || previsao.isIgnored || previsao.origem === 'extrato') return false
  if (realizado.isIgnored) return false

  // O "realizado" tem de ser lançamento de verdade, já aplicado no saldo da
  // conta, e sem vínculo próprio — senão o valor some dos DOIS saldos (mesmo
  // risco do docblock de `condicaoDePropostaAprovavel`): a previsão sai do
  // saldo projetado achando que foi cumprida por algo que nunca entrou no
  // saldo real, ou que já está comprometido com outra previsão. Inclui o
  // caso degenerado de vincular a previsão a si mesma.
  if (realizadoId === previsaoId || !realizado.balanceApplied || realizado.matchedTransactionId) return false

  // Realizado que outra previsão já reivindicou: o índice único da 00042
  // estouraria no UPDATE. Melhor dizer "não vale mais" que lançar.
  const [reivindicado] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, realizadoId)))
    .limit(1)
  if (reivindicado) return false

  await tx.update(transactions).set({ matchedTransactionId: realizadoId }).where(condicaoDaTransacaoDaOrg(previsaoId, orgId))

  if (previsao.aguardaExtrato) {
    await aplicarEfeitoDaAbsorcao(tx, orgId, previsao, realizadoId)
  } else if (realizado.reviewState === 'pending' && previsao.type !== 'transfer' && previsao.categoryId) {
    // A previsão já diz o que o dinheiro é: o card não pede classificação.
    await tx.update(transactions)
      .set({ type: previsao.type, categoryId: previsao.categoryId, reviewState: 'confirmed' })
      .where(condicaoDaTransacaoDaOrg(realizadoId, orgId))
  }

  const pendente = and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'))
  const doPar = and(eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId))
  await tx.update(forecastMatchProposals).set({ status: 'approved', decidedAt: new Date() }).where(and(pendente, doPar))
  await tx.update(forecastMatchProposals).set({ status: 'refused', decidedAt: new Date() }).where(and(
    pendente,
    or(eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId)),
    or(ne(forecastMatchProposals.forecastTransactionId, previsaoId), ne(forecastMatchProposals.realizedTransactionId, realizadoId)),
  ))
  return true
}
