/**
 * O que e conta de investimento, e por que a pergunta existe.
 *
 * Conta de investimento nao pertence ao mundo das transacoes: nao pode ser
 * escolhida num lancamento novo e nao soma na coluna de saldo corrido da
 * listagem. A perna de um aporte continua aparecendo — ela debita a conta
 * corrente e credita a corretora, e esconder isso apagaria o registro — mas
 * o saldo da listagem e de conta corrente e cartao. Somar a corretora junto
 * faz o aporte se anular e parecer que nao custou nada.
 *
 * O patrimonio tem o mesmo problema pelo outro lado: `computeSnapshot` soma o
 * saldo da conta de investimento E as posicoes por cima, contando o mesmo
 * dinheiro duas vezes. As posicoes sao a verdade; o saldo da conta, nao.
 *
 * A definicao e por EXCLUSAO e nao por uma lista fechada de "corrente e
 * cartao". Poupanca e dinheiro em especie sao transacionais, mesmo que a
 * primeira renda: uma lista fechada os deixaria de fora no dia em que
 * aparecessem, e o erro seria silencioso — some do seletor, some do saldo, e
 * ninguem e avisado.
 */

/** Tipos de `accounts.type` que representam investimento. */
export const TIPOS_DE_INVESTIMENTO: readonly string[] = ['brokerage']

export function ehContaDeInvestimento(type: string | null | undefined): boolean {
  return type != null && TIPOS_DE_INVESTIMENTO.includes(type)
}
