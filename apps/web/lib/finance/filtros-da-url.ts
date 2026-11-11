export type SituacaoDoFiltro = 'realizado' | 'previsto' | 'ambos'

/** Só realizado, previsto e ambos valem; qualquer outro valor da URL é ignorado. */
export function situacaoDaUrl(valor?: string): SituacaoDoFiltro | undefined {
  return valor === 'realizado' || valor === 'previsto' || valor === 'ambos' ? valor : undefined
}

/** Teto de "selecionar todas do filtro": meses de extrato, sem mandar dezenas de milhares de ids. */
export const LIMITE_DA_SELECAO = 2000

/**
 * Filtros da lista de transações a partir dos parâmetros da URL. A página e
 * "selecionar todas do filtro" leem daqui, para as duas verem o mesmo recorte.
 */
export function filtrosDaUrl(params: Record<string, string | undefined>) {
  return {
    accountId: params.accountId,
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
    sortBy: params.sortBy ?? 'date',
    // Do mais antigo para o mais novo, como um extrato — ver
    // `buildTransactionOrder`.
    sortDir: params.sortDir ?? 'asc',
    types: params.types,
    categoryIds: params.categoryIds,
    minAmount: params.minAmount ? parseInt(params.minAmount, 10) : undefined,
    maxAmount: params.maxAmount ? parseInt(params.maxAmount, 10) : undefined,
    // A lista abre em hoje. O futuro entra por este toggle — ver o porque em
    // `buildTransactionConditions`.
    includeFuture: params.future === '1',
    cardDigits: params.cardDigits,
    soAnalises: params.caixa === '1',
    situacao: situacaoDaUrl(params.situacao),
    // Fechamento da fatura do cartão; os ids saem de `comFatura`, no servidor.
    fatura: /^\d{4}-\d{2}-\d{2}$/.test(params.fatura ?? '') ? params.fatura : undefined,
  }
}
