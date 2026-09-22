/**
 * O que entra no saldo PROJETADO da listagem de transações.
 *
 * Há dois saldos no app, e eles respondem perguntas diferentes:
 *
 * - `accounts.balance_cents` — quanto existe. Só o que aconteceu de verdade,
 *   para poder ser comparado com o app do banco. Previsão nunca entra.
 * - o saldo corrido da listagem — quanto vai existir. Soma a previsão futura,
 *   que é justamente o que serve para planejar o mês.
 *
 * A previsão sai da projeção no dia em que vence. Dali em diante quem diz o
 * que aconteceu é o extrato, e enquanto ele não traz o par a linha fica
 * marcada como não conciliada na tela. Mantê-la somando seria repetir, na
 * projeção, o defeito que tirou R$ 126.746,00 de estimativa do saldo real.
 *
 * A previsão também sai quando existe proposta de conciliação aberta para
 * ela: o realizado que a proposta aponta já entrou no saldo, então somar as
 * duas contaria o mesmo dinheiro duas vezes.
 *
 * Esta regra tem uma gêmea em SQL, `sqlContaNoSaldo`
 * (lib/finance/balance-sql.ts), que decide dentro das somas de janela da
 * listagem. As duas PRECISAM dizer a mesma coisa: quando divergem, o saldo do
 * topo da página vem de uma regra e os incrementos de outra, a coluna inteira
 * fica errada e nada quebra. Mexeu numa, mexa na outra — `saldo-projetado.test.ts`
 * e `regra-de-saldo-sql.test.ts` descrevem os mesmos critérios de propósito.
 */

import { ehContaDeInvestimento } from '@floow/core-finance'

/** Só os campos que decidem — qualquer linha da listagem serve. */
interface LinhaProjetavel {
  balanceApplied?: boolean
  /**
   * "Este lancamento e errado, nao existe". O saldo da conta ja foi estornado
   * quando o usuario marcou, entao somar aqui mostra dinheiro que a conta nao
   * tem. Ausente conta como nao ignorado — dado que falta nunca deve fazer
   * saldo sumir em silencio, mesma escolha de `accountType`.
   */
  isIgnored?: boolean
  date: Date | string
  matchedTransactionId?: string | null
  /**
   * Há proposta de conciliação esperando decisão para esta previsão. Na
   * listagem o campo chega pronto, por subquery (`getTransactionsWithCount`).
   */
  hasPendingMatchProposal?: boolean
  /**
   * `accounts.type` da conta da linha. Ausente conta como transacional: dado
   * que falta nunca deve fazer saldo sumir em silêncio.
   */
  accountType?: string | null
}

/** Meia-noite em São Paulo do dia da linha, para comparar dia com dia. */
function diaDe(valor: Date | string): number {
  const d = valor instanceof Date ? valor : new Date(`${String(valor).slice(0, 10)}T00:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function contaNoSaldoProjetado(linha: LinhaProjetavel, hoje: Date): boolean {
  // Conta de investimento não entra nesta coluna. A perna do aporte continua
  // na lista, porque registra o dinheiro saindo da corrente e entrando na
  // corretora — mas somar as duas anula o aporte, e ele passa a parecer que
  // não custou nada.
  if (ehContaDeInvestimento(linha.accountType)) return false

  // Ignorado não soma em saldo nenhum: `toggleIgnoreTransaction` já estornou
  // `accounts.balance_cents`. Vem ANTES do teste de realizado porque é
  // justamente lá que a premissa "já está no balance_cents" deixa de valer.
  if (linha.isIgnored === true) return false

  // Realizado: já aconteceu, já está em `accounts.balance_cents`.
  if (linha.balanceApplied !== false) return true

  // Previsão já cumprida pelo extrato: quem soma é o realizado, não ela.
  if (linha.matchedTransactionId) return false

  // Previsão com proposta de conciliação aberta: o lançamento do banco que a
  // proposta aponta JÁ entrou no saldo, e o vínculo só é gravado quando o
  // usuário aprova na fila. É o salário adiantado — previsão de R$ 32.500 no
  // dia 15, o banco creditou R$ 32.638,85 no dia 13 porque o dia 15 caiu no
  // sábado, e hoje é 14. Somar as duas linhas conta o mesmo dinheiro duas
  // vezes; tirar a estimativa e ficar com o que o banco pagou é o lado
  // conservador do erro.
  if (linha.hasPendingMatchProposal) return false

  // Previsão ainda por vencer: é a projeção.
  return diaDe(linha.date) > diaDe(hoje)
}
