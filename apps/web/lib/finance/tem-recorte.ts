// Parâmetros que tiram lançamentos da lista. Ordenação, página e "incluir
// futuras" não escondem nada, então não entram.
const RECORTES = ['accountId', 'search', 'startDate', 'endDate', 'types', 'categoryIds', 'minAmount', 'maxAmount', 'cardDigits']

/** A URL da lista de transações tem algum filtro que esconde lançamentos? */
export function temRecorte(params: URLSearchParams): boolean {
  return RECORTES.some((k) => params.get(k))
}
