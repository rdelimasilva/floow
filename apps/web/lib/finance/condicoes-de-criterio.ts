import { and, eq, type SQL } from 'drizzle-orm'
import { transactions } from '@floow/db'
import { effectiveAffectsCashFlow } from './affects-cash-flow'
import { sqlPrevisaoAindaPorVencer } from './balance-sql'
import { somenteRealizado } from './realized-spending'

export type SituacaoDoFiltro = 'realizado' | 'previsto'

/** Só `realizado` e `previsto` valem; qualquer outro valor da URL é ignorado. */
export function situacaoDaUrl(valor?: string): SituacaoDoFiltro | undefined {
  return valor === 'realizado' || valor === 'previsto' ? valor : undefined
}

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
  if (opts?.situacao === 'previsto') {
    out.push(and(eq(transactions.balanceApplied, false), sqlPrevisaoAindaPorVencer(hoje))!)
  }
  return out
}
