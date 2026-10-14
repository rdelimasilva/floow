import type { PolpCardBill } from '@floow/core-finance'
import { fechamentoNoMes } from '@floow/core-finance/src/fatura'
import type { PagamentoDoBanco } from './faturas-do-banco'

/**
 * Onde começa o histórico do cartão.
 *
 * O cartão soma as compras em negativo e os pagamentos (transferências da
 * conta corrente) as zeram. Isso só fecha se as compras de cada fatura
 * estiverem todas no app. A Polp entrega o histórico a partir de um dia
 * qualquer — o Master Black começa em 16/10/2025, no meio da fatura que
 * fechou em 09/11 — e a fatura do começo chega incompleta: o pagamento dela
 * entraria inteiro contra só parte das compras.
 *
 * O histórico começa no dia seguinte ao fechamento da primeira fatura que o
 * histórico alcança (a incompleta). Antes disso nada conta: nem as compras,
 * nem os pagamentos que quitaram aquela dívida.
 */

/** Dia seguinte, AAAA-MM-DD. */
function diaSeguinte(d: string): string {
  const x = new Date(`${d}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + 1)
  return x.toISOString().slice(0, 10)
}

/** A data vem como meia-noite de São Paulo em UTC (03:00Z). */
function diaEmSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * O primeiro dia do histórico: o dia seguinte ao primeiro fechamento na data
 * da primeira compra ou depois dela. Pelas faturas do banco; sem elas, pelo
 * dia de fechamento cadastrado.
 */
export function inicioDoHistorico(
  primeiraCompra: string,
  faturas: readonly PolpCardBill[],
  closingDay: number | null,
): string | null {
  const fechamentos = faturas.map((f) => diaEmSaoPaulo(f.bill_closing_date)).filter((f) => f >= primeiraCompra).sort()
  if (fechamentos.length > 0) return diaSeguinte(fechamentos[0])
  if (closingDay == null) return null
  const [ano, mes] = [Number(primeiraCompra.slice(0, 4)), Number(primeiraCompra.slice(5, 7))]
  const noMes = fechamentoNoMes(ano, mes, closingDay)
  return diaSeguinte(noMes >= primeiraCompra ? noMes : fechamentoNoMes(ano, mes + 1, closingDay))
}

/**
 * Os pagamentos que contam a partir do início. Fica de fora o que quitou a
 * dívida anterior: todo pagamento até o fechamento da última fatura antes do
 * início, e depois dele, em ordem, os que cobrem o total dela. O que se pagou
 * além disso é crédito para o primeiro ciclo e conta (Master Black: R$ 11.413,57
 * em 17/11 quitam a fatura de 09/11; os R$ 20.150 de 24/11 contam).
 */
export function pagamentosDoHistorico(
  pagamentos: readonly PagamentoDoBanco[],
  faturas: readonly PolpCardBill[],
  inicio: string,
): PagamentoDoBanco[] {
  const anterior = faturas
    .map((f) => ({ fechamento: diaEmSaoPaulo(f.bill_closing_date), total: Math.round(Number(f.bill_total_amount.amount) * 100) }))
    .filter((f) => f.fechamento < inicio)
    .sort((a, b) => b.fechamento.localeCompare(a.fechamento))[0]
  if (!anterior) return pagamentos.filter((p) => p.date >= inicio)

  let aQuitar = Math.max(0, anterior.total)
  const contam: PagamentoDoBanco[] = []
  for (const p of [...pagamentos].sort((a, b) => a.date.localeCompare(b.date))) {
    if (p.date <= anterior.fechamento) continue
    if (aQuitar > 0 && p.amountCents <= aQuitar) {
      aQuitar -= p.amountCents
      continue
    }
    contam.push(p)
  }
  return contam
}

/** O lançamento é do histórico: pela data, ou pelo mês da fatura em que caiu. */
export function noHistorico(tx: { date: string; billForecastMonth: string | null }, inicio: string): boolean {
  if (tx.date >= inicio) return true
  return tx.billForecastMonth != null && tx.billForecastMonth > inicio.slice(0, 7)
}
