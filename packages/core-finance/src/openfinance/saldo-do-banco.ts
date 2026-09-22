/**
 * O saldo que o BANCO informa, lido do detalhe do recurso da Polp.
 *
 * O floow deriva o saldo somando lancamento (`accounts.balance_cents`), e ate
 * aqui nunca o conferia com a fonte. Quando a Polp reemitiu um pagamento com
 * outro `external_id`, o dedupe por id nao pegou, o valor entrou duas vezes e
 * o erro so apareceu quando o usuario abriu o extrato tres dias depois.
 *
 * Conferir um numero contra o outro pega isso no mesmo dia — e, diferente de
 * um detector de duplicata, pega tambem o defeito que ninguem previu: basta
 * que os dois nao batam.
 *
 * Extrair e separado de conferir: a forma do payload e da Polp, a regra de
 * divergencia e nossa.
 */

/** Uma casa a mais que centavo ja basta para o arredondamento ser visivel. */
const CENTAVOS_POR_UNIDADE = 100

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

/**
 * Saldo disponivel em centavos, ou `null` quando o payload nao o traz.
 *
 * `null` nao e erro: o detalhe de `CREDIT_CARD_ACCOUNT` traz `limits` e nunca
 * `balance`, porque saldo de cartao e outra semantica (fatura x limite usado)
 * e nao se compara com o saldo de uma conta corrente. Quem chama trata `null`
 * como "esta fonte nao responde essa pergunta" e nao confere nada.
 *
 * A Polp mistura string e number no mesmo payload — `available_amount.amount`
 * vem `"6151.18"` enquanto `limits[].unbilled_amount.amount` vem `11685.4` —
 * entao os dois sao aceitos.
 */
export function extrairSaldoDisponivelCents(detalhe: unknown): number | null {
  if (!ehObjeto(detalhe)) return null

  const balance = detalhe.balance
  if (!ehObjeto(balance)) return null

  const disponivel = balance.available_amount
  if (!ehObjeto(disponivel)) return null

  const bruto = disponivel.amount
  if (typeof bruto !== 'string' && typeof bruto !== 'number') return null

  const valor = typeof bruto === 'string' ? Number(bruto) : bruto
  if (!Number.isFinite(valor)) return null

  // Arredonda, nunca trunca: 1234.565 em float e 1234.5649999..., e truncar
  // comeria o centavo — justamente o digito que a conferencia compara.
  return Math.round(valor * CENTAVOS_POR_UNIDADE)
}

/**
 * Quando o BANCO apurou o saldo — `update_date_time` do payload, nunca o
 * relogio de quem grava.
 *
 * A conferencia compara dois instantes: um saldo apurado as 07:14 confrontado
 * com lancamentos que entraram as 23h acusaria divergencia que e so
 * defasagem. Guardando a apuracao, quem le decide se a comparacao ainda vale.
 *
 * `null` quando a data nao veio ou nao e legivel — melhor nao afirmar do que
 * carimbar `now()` e fingir frescor que o dado nao tem.
 */
export function extrairApuracaoDoSaldo(detalhe: unknown): Date | null {
  if (!ehObjeto(detalhe)) return null

  const balance = detalhe.balance
  if (!ehObjeto(balance)) return null

  const bruto = balance.update_date_time
  if (typeof bruto !== 'string') return null

  const data = new Date(bruto)
  return Number.isNaN(data.getTime()) ? null : data
}
