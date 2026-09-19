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
 */

/** Só os campos que decidem — qualquer linha da listagem serve. */
interface LinhaProjetavel {
  balanceApplied?: boolean
  date: Date | string
  matchedTransactionId?: string | null
}

/** Meia-noite em São Paulo do dia da linha, para comparar dia com dia. */
function diaDe(valor: Date | string): number {
  const d = valor instanceof Date ? valor : new Date(`${String(valor).slice(0, 10)}T00:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function contaNoSaldoProjetado(linha: LinhaProjetavel, hoje: Date): boolean {
  // Realizado: já aconteceu, já está em `accounts.balance_cents`.
  if (linha.balanceApplied !== false) return true

  // Previsão já cumprida pelo extrato: quem soma é o realizado, não ela.
  if (linha.matchedTransactionId) return false

  // Previsão ainda por vencer: é a projeção.
  return diaDe(linha.date) > diaDe(hoje)
}
