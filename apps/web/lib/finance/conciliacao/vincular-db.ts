import { getDb, transactions, forecastMatchProposals } from '@floow/db'
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { aplicarEfeitoDaAbsorcao } from './absorver'
import { registrarVinculo } from './registro'
import { registrarEventos } from './validacoes'
import { realinharSerie } from './realinhar-serie'
import { condicaoDaTransacaoDaOrg } from '@/lib/finance/forecast-match-db'

type Db = ReturnType<typeof getDb>

export type ResultadoDoVinculo = { efetivada: boolean; classificou: boolean }

const NAO_VALE: ResultadoDoVinculo = { efetivada: false, classificou: false }

/**
 * O vínculo previsão → lançamento do banco, com ou sem proposta prévia
 * (spec 2026-10-01 §5.1). Único gravador de `matched_transaction_id` fora do
 * motor R1. Reconfere as duas pontas: a tela é renderizada e o clique chega
 * depois — ver o docblock de `aprovarProposta` para o porquê de cada checagem.
 * Devolve `efetivada: false` sem gravar nada quando o par deixou de valer.
 *
 * `classificou`: o realizado terminou fora de `pending` — já estava, a
 * previsão passou a categoria, ou a absorção aplicou efeito (todo efeito
 * confirma). É o que tira o card da fase "classificar"; a tela não tem como
 * saber sozinha (perna de transferência sem categoria classifica; previsão
 * com a categoria apagada, não).
 */
export async function vincularNoBanco(
  tx: Db, orgId: string, realizadoId: string, previsaoId: string,
  /** Proposta de TROCA: o realizado a que a previsão está presa hoje. */
  substitui: string | null = null,
): Promise<ResultadoDoVinculo> {
  const pontas = await tx
    .select({
      id: transactions.id, matchedTransactionId: transactions.matchedTransactionId, balanceApplied: transactions.balanceApplied,
      isIgnored: transactions.isIgnored, externalId: transactions.externalId, transferAccountId: transactions.transferAccountId,
      aguardaExtrato: transactions.aguardaExtrato, origem: transactions.origem, categoryId: transactions.categoryId,
      description: transactions.description, transferGroupId: transactions.transferGroupId, type: transactions.type,
      reviewState: transactions.reviewState, accountId: transactions.accountId, amountCents: transactions.amountCents,
      counterpartyId: transactions.counterpartyId, date: transactions.date, recurringTemplateId: transactions.recurringTemplateId,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), inArray(transactions.id, [previsaoId, realizadoId])))

  const previsao = pontas.find((p) => p.id === previsaoId)
  const realizado = pontas.find((p) => p.id === realizadoId)
  if (!previsao || !realizado) return NAO_VALE
  // Pelo card a troca chega sem `substitui`: ela vale se houver proposta de
  // troca pendente deste par apontando para o vínculo de hoje.
  if (substitui === null && previsao.matchedTransactionId) {
    const [troca] = await tx
      .select({ id: forecastMatchProposals.id })
      .from(forecastMatchProposals)
      .where(and(
        eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'),
        eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId),
        eq(forecastMatchProposals.substituiTransactionId, previsao.matchedTransactionId),
      ))
      .limit(1)
    if (troca) substitui = previsao.matchedTransactionId
  }
  // A previsão tem de estar livre — ou, na troca, ainda presa ao vínculo que a
  // troca substitui.
  if ((previsao.matchedTransactionId ?? null) !== substitui) return NAO_VALE
  if (previsao.balanceApplied || previsao.isIgnored || previsao.origem === 'extrato') return NAO_VALE
  // Troca só em previsão de recorrência: a linha que aguardava o extrato deu
  // efeito ao extrato antigo quando foi absorvida, e isso não se desfaz aqui
  // (é `desconciliar` que devolve).
  if (substitui && previsao.aguardaExtrato) return NAO_VALE
  if (realizado.isIgnored) return NAO_VALE

  // O "realizado" tem de ser lançamento de verdade, já aplicado no saldo da
  // conta, e sem vínculo próprio — senão o valor some dos DOIS saldos (mesmo
  // risco do docblock de `condicaoDePropostaAprovavel`): a previsão sai do
  // saldo projetado achando que foi cumprida por algo que nunca entrou no
  // saldo real, ou que já está comprometido com outra previsão. Inclui o
  // caso degenerado de vincular a previsão a si mesma.
  if (realizadoId === previsaoId || !realizado.balanceApplied || realizado.matchedTransactionId) return NAO_VALE

  // "Procurar previsão" casa por valor absoluto e entre contas; o servidor
  // não pode confiar nisso. Sinal trocado faz a saída prevista sumir do saldo
  // projetado por causa de uma entrada (e vice-versa). E a perna de
  // transferência que aguarda extrato é da conta dela: absorvê-la pelo
  // extrato de outra conta vira transferência da conta para si mesma.
  if (Math.sign(previsao.amountCents) !== Math.sign(realizado.amountCents)) return NAO_VALE
  if (previsao.aguardaExtrato && previsao.accountId !== realizado.accountId) return NAO_VALE

  // Realizado que outra previsão já reivindicou: o índice único da 00042
  // estouraria no UPDATE. Melhor dizer "não vale mais" que lançar.
  const [reivindicado] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), eq(transactions.matchedTransactionId, realizadoId)))
    .limit(1)
  if (reivindicado) return NAO_VALE

  // Troca: o par antigo fica recusado para sempre.
  if (substitui) {
    await tx.update(forecastMatchProposals)
      .set({ status: 'refused', decisao: 'usuario', decidedAt: new Date() })
      .where(and(
        eq(forecastMatchProposals.orgId, orgId),
        eq(forecastMatchProposals.forecastTransactionId, previsaoId),
        eq(forecastMatchProposals.realizedTransactionId, substitui),
      ))
  }

  await tx.update(transactions).set({ matchedTransactionId: realizadoId }).where(condicaoDaTransacaoDaOrg(previsaoId, orgId))

  let classificou = realizado.reviewState !== 'pending'
  if (previsao.aguardaExtrato) {
    if (await aplicarEfeitoDaAbsorcao(tx, orgId, previsao, realizadoId)) classificou = true
  } else if (realizado.reviewState === 'pending' && previsao.type !== 'transfer' && previsao.categoryId) {
    classificou = true
    // A previsão já diz o que o dinheiro é: o card não pede classificação.
    await tx.update(transactions)
      .set({ type: previsao.type, categoryId: previsao.categoryId, reviewState: 'confirmed' })
      .where(condicaoDaTransacaoDaOrg(realizadoId, orgId))
    await registrarEventos(tx, orgId, 'vinculo', null, [
      { transactionId: realizadoId, counterpartyId: realizado.counterpartyId ?? null, natureza: previsao.type, categoriaId: previsao.categoryId },
    ])
  }

  // As outras propostas abertas das duas pontas perdem o sentido. O par em si
  // ganha o registro que a 00073 exige — com ou sem proposta prévia.
  const pendente = and(eq(forecastMatchProposals.orgId, orgId), eq(forecastMatchProposals.status, 'pending'))
  await tx.update(forecastMatchProposals).set({ status: 'refused', decisao: 'usuario', decidedAt: new Date() }).where(and(
    pendente,
    or(eq(forecastMatchProposals.forecastTransactionId, previsaoId), eq(forecastMatchProposals.realizedTransactionId, realizadoId)),
    or(ne(forecastMatchProposals.forecastTransactionId, previsaoId), ne(forecastMatchProposals.realizedTransactionId, realizadoId)),
  ))
  await registrarVinculo(tx, orgId, previsaoId, realizadoId, 'usuario')
  // O dia em que o banco cobrou vira o dia da série: a próxima parcela já
  // casa sozinha em vez de contar em dobro (`realinhar-serie.ts`).
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  await realinharSerie(tx, orgId, previsao, realizado.date, hoje)
  return { efetivada: true, classificou }
}
