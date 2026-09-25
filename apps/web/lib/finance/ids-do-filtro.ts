'use server'

import { getOrgId, getTransactionsWithCount } from './queries'
import { filtrosDaUrl, LIMITE_DA_SELECAO } from './filtros-da-url'

/**
 * Ids de todas as transações do filtro atual (não só da página), para as ações
 * em lote. `total` é quanto o filtro tem; se passar do limite, a tela avisa.
 */
export async function idsDoFiltro(query: string): Promise<{ ids: string[]; total: number }> {
  const orgId = await getOrgId()
  const params = Object.fromEntries(new URLSearchParams(query).entries())
  const { transactions, totalCount } = await getTransactionsWithCount(orgId, {
    ...filtrosDaUrl(params),
    limit: LIMITE_DA_SELECAO,
    offset: 0,
  })
  return { ids: transactions.map((t) => t.id), total: totalCount }
}
