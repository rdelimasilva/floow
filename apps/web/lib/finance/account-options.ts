import { ehContaDeInvestimento } from '@floow/core-finance'

/** O que os seletores das telas de transacao consomem. */
interface OpcaoDeConta {
  id: string
  name: string
}

/**
 * As contas que podem receber um lancamento.
 *
 * Conta de investimento fica de fora. Um aporte nasce na conta corrente e
 * vira transferencia; a perna da corretora e consequencia disso, nao algo que
 * se digita. Oferecer a corretora no seletor convida a lancar despesa e
 * receita direto nela — foi assim que o saldo de uma delas chegou a
 * -R$ 69.770,47 nos dados reais, com resgate saindo sem aporte ter entrado.
 *
 * O corte e aqui e nao em `getAccounts` de proposito: aquela consulta alimenta
 * tambem as telas de contas, patrimonio e investimentos, onde a corretora
 * precisa aparecer.
 */
export function semContasDeInvestimento<T extends { type: string }>(
  contas: readonly T[],
): T[] {
  return contas.filter((c) => !ehContaDeInvestimento(c.type))
}

/**
 * Igual, no formato reduzido que os seletores de filtro e de recorrencia
 * consomem. Existe porque `TransactionForm` e `ImportForm` pedem a conta
 * inteira e os outros seletores pedem so `{ id, name }` — duas formas de
 * verdade, nao duplicacao.
 */
export function contasParaLancamento(
  contas: readonly { id: string; name: string; type: string }[],
): OpcaoDeConta[] {
  return semContasDeInvestimento(contas).map((c) => ({ id: c.id, name: c.name }))
}

/**
 * As contas que podem ser destino de uma transferencia — todas, corretora
 * inclusive. Aporte e exatamente isso: transferencia da conta corrente para a
 * corretora. Barrar a corretora aqui deixa o aporte sem como ser lancado.
 */
export function destinosDeTransferencia(
  contas: readonly { id: string; name: string }[],
): OpcaoDeConta[] {
  return contas.map((c) => ({ id: c.id, name: c.name }))
}
