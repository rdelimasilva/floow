/**
 * A conferência entre o saldo que derivamos e o que o banco informa.
 *
 * `accounts.balance_cents` é a soma dos lançamentos aplicados — construído por
 * nós. `openfinance_resources.bank_balance_cents` é o que o banco diz. Quando
 * os dois não batem, alguma coisa entrou a mais, a menos, ou entrou errada.
 *
 * Função pura, separada da leitura do payload e da tela: a forma do dado é da
 * Polp, a decisão de quando alarmar é nossa, e quem desenha o aviso não
 * precisa saber nenhuma das duas.
 */

export interface ConferenciaDeSaldo {
  /** Houve conferência de verdade? `false` quando o banco não informou saldo. */
  comparavel: boolean
  /** Os dois números discordam? Sempre `false` quando não é comparável. */
  divergente: boolean
  /**
   * `saldoLocal - saldoBanco`, com o sinal de quem sobra: negativo significa
   * que falta dinheiro do nosso lado. No caso que originou esta peça, a fatura
   * duplicada deixou a diferença em -R$ 23.665,59.
   */
  diferencaCents: number
}

/**
 * Sem tolerância de propósito: um centavo de diferença é um lançamento errado
 * em algum lugar, e arredondar a conferência esconderia justamente o dígito
 * que ela existe para vigiar.
 */
export function compararComOBanco(entrada: {
  saldoLocalCents: number
  saldoBancoCents: number | null
}): ConferenciaDeSaldo {
  // Cartão de crédito e conta sem Open Finance caem aqui. Ausência de dado não
  // é conferência bem-sucedida — dizer "bate" seria mentir por omissão.
  if (entrada.saldoBancoCents === null) {
    return { comparavel: false, divergente: false, diferencaCents: 0 }
  }

  const diferencaCents = entrada.saldoLocalCents - entrada.saldoBancoCents

  return { comparavel: true, divergente: diferencaCents !== 0, diferencaCents }
}
