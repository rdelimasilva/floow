/**
 * Escrita do desconciliar (ver `desconciliar.ts`). Separada da server action
 * para rodar dentro de uma transação qualquer — inclusive a de teste contra o
 * banco real, que termina em rollback.
 */
import { and, eq, ne, isNotNull } from 'drizzle-orm'
import { forecastMatchProposals, transactions, type getDb } from '@floow/db'
import { desfazerParDaRegra } from '@/lib/openfinance/desfazer-par'
import { ehPernaCriadaPelaRegra, podeDesconciliar, type FilaDeOrigem } from './desconciliar'

type Db = ReturnType<typeof getDb>

const colunas = {
  id: transactions.id,
  accountId: transactions.accountId,
  amountCents: transactions.amountCents,
  description: transactions.description,
  transferGroupId: transactions.transferGroupId,
  balanceApplied: transactions.balanceApplied,
  isIgnored: transactions.isIgnored,
  externalId: transactions.externalId,
  counterpartyId: transactions.counterpartyId,
  reviewState: transactions.reviewState,
  matchedTransactionId: transactions.matchedTransactionId,
}

export async function desconciliarNoBanco(tx: Db, orgId: string, transactionId: string): Promise<FilaDeOrigem> {
  const [linha] = await tx.select(colunas).from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.orgId, orgId))).limit(1)
  if (!linha) throw new Error('Lançamento não encontrado')

  // A previsão que este realizado cumpre, se houver.
  const [previsaoCumprida] = linha.matchedTransactionId ? [] : await tx
    .select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, linha.id))).limit(1)

  const fila = podeDesconciliar({ ...linha, cumprePrevisao: Boolean(previsaoCumprida) })
  if (!fila) {
    if (linha.counterpartyId && linha.reviewState === 'pending') throw new Error('Este lançamento já está na fila Classificar.')
    throw new Error('Este lançamento não foi conciliado por nenhuma fila.')
  }

  if (fila === 'previsoes') {
    const previsaoId = linha.matchedTransactionId ? linha.id : previsaoCumprida!.id
    const realizadoId = linha.matchedTransactionId ?? linha.id
    // O inverso de `aprovarProposta`: solta o vínculo e reabre a MESMA
    // proposta — o índice único (previsão, realizado) da 00047 guarda a
    // aprovada, e o sync nunca proporia o par de novo. Casamento anterior à
    // fila não tem proposta: nasce uma pendente, para voltar à fila já.
    await tx.update(transactions).set({ matchedTransactionId: null })
      .where(and(eq(transactions.id, previsaoId), eq(transactions.orgId, orgId)))
    await tx.insert(forecastMatchProposals)
      .values({ orgId, forecastTransactionId: previsaoId, realizedTransactionId: realizadoId, status: 'pending' })
      .onConflictDoUpdate({
        target: [forecastMatchProposals.forecastTransactionId, forecastMatchProposals.realizedTransactionId],
        set: { status: 'pending', decidedAt: null },
      })
    return fila
  }

  // Classificar: a decisão mora no lançamento do banco que tem a contraparte.
  // Clicou na perna que a regra criou? A origem é a outra ponta do grupo.
  let origem = linha
  if (ehPernaCriadaPelaRegra(linha.externalId) && linha.transferGroupId) {
    const [outra] = await tx.select(colunas).from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        eq(transactions.transferGroupId, linha.transferGroupId),
        ne(transactions.id, linha.id),
        isNotNull(transactions.counterpartyId),
      )).limit(1)
    if (!outra) {
      throw new Error('Este par foi criado automaticamente, não por uma fila. Para desfazer, exclua a transferência.')
    }
    origem = outra
  }
  if (origem.reviewState !== 'confirmed') throw new Error('Este lançamento já está na fila Classificar.')

  const r = await desfazerParDaRegra(tx, orgId, origem)
  if (r.forma === 'par-do-outro-lado') {
    throw new Error('Este par foi conciliado a partir da outra conta. Desconcilie a previsão de lá.')
  }
  return fila
}
