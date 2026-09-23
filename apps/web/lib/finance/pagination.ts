interface PaginaQueAbreOpts {
  /** O `page` da URL, se veio. */
  pageParam?: string
  totalCount: number
  /**
   * Com futuros ligados: quantos lançamentos vão até hoje. A última página
   * deixa de ser "hoje" e vira a parcela mais distante (até 60 meses à frente),
   * então a abertura mira a página de hoje por esta contagem.
   */
  totalAteHoje?: number
  pageSize: number
  sortBy?: string
  sortDir?: string
}

/**
 * Em que página a listagem abre.
 *
 * A ordem padrão é crescente — do mais antigo para o mais novo, como um
 * extrato — e nessa ordem a data mais recente fica na ÚLTIMA página. Abrir na
 * primeira seria abrir em 2019, que não é o que ninguém vai ver quando entra
 * em transações.
 *
 * Três regras, nesta ordem:
 *
 * 1. `page` na URL manda. É o que faz paginar para trás funcionar e a
 *    navegação não ser sequestrada de volta para o fim a cada clique.
 * 2. Sem `page`, na ordem cronológica crescente: a última página.
 * 3. Qualquer outra ordenação (por valor, por descrição, ou decrescente): a
 *    primeira. Aí "última página" não quer dizer "mais recente", e em
 *    decrescente o mais recente já está no topo da primeira.
 */
export function paginaQueAbre({
  pageParam,
  totalCount,
  totalAteHoje,
  pageSize,
  sortBy = 'date',
  sortDir = 'asc',
}: PaginaQueAbreOpts): number {
  const pedida = parseInt(pageParam ?? '', 10)
  if (Number.isFinite(pedida)) return Math.max(1, pedida)

  const cronologicaCrescente = sortBy === 'date' && sortDir !== 'desc'
  if (!cronologicaCrescente) return 1

  return Math.max(1, Math.ceil((totalAteHoje ?? totalCount) / pageSize))
}

/**
 * Os filtros da contagem "até hoje": os mesmos da lista, sem os futuros e com
 * a data final cortada em hoje (a que já está no passado fica como está).
 */
export function filtrosAteHoje<T extends { endDate?: string; includeFuture?: boolean }>(
  filters: T,
  hoje: string,
): Omit<T, 'endDate' | 'includeFuture'> & { endDate: string; includeFuture: false } {
  const endDate = filters.endDate && filters.endDate < hoje ? filters.endDate : hoje
  return { ...filters, includeFuture: false, endDate }
}
