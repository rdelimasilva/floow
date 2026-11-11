import { and, eq, or, type SQL } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { effectiveAffectsCashFlow } from './affects-cash-flow'
import { sqlPrevisaoAindaPorVencer } from './balance-sql'
import { somenteRealizado } from './realized-spending'
import type { SituacaoDoFiltro } from './filtros-da-url'

/**
 * Os critérios que as análises aplicam, como filtro visível da lista.
 *
 * `soAnalises` repete o que Gastos e Fluxo de caixa contam: confirmado, não
 * ignorado, e que afeta o caixa. Exige `leftJoin(categories)` na consulta.
 * `previsto` repete `getFutureTransactions`: previsão ainda por vencer.
 */
export function condicoesDeCriterio(
  opts: { soAnalises?: boolean; situacao?: SituacaoDoFiltro } | undefined,
  hoje: string,
): SQL[] {
  const out: SQL[] = []
  if (opts?.soAnalises) {
    out.push(
      eq(transactions.isIgnored, false),
      eq(transactions.reviewState, 'confirmed'),
      effectiveAffectsCashFlow,
    )
  }
  if (opts?.situacao === 'realizado') out.push(somenteRealizado)
  const previsao = () => and(eq(transactions.balanceApplied, false), sqlPrevisaoAindaPorVencer(hoje))!
  if (opts?.situacao === 'previsto') out.push(previsao())
  // Realizado ou previsão ainda por vencer: o que o Fluxo de caixa soma na visão Ambos.
  if (opts?.situacao === 'ambos') out.push(or(somenteRealizado, previsao())!)
  return out
}
