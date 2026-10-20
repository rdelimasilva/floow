/**
 * Ordem da tabela de recorrências: o que vence primeiro no topo.
 *
 * Ativas pela próxima parcela em aberto (`proximaParcela`, de
 * `getDatasDasParcelas`); as sem parcela em aberto vêm depois e as pausadas
 * no fim. Não usa `next_due_date`: como as parcelas nascem todas na criação,
 * ele aponta para um período depois da última.
 */
export function ordenarPorProximaParcela<T extends { isActive: boolean; proximaParcela?: string | null }>(
  templates: T[],
): T[] {
  const grupo = (t: T) => (!t.isActive ? 2 : t.proximaParcela ? 0 : 1)
  return [...templates].sort((a, b) =>
    grupo(a) - grupo(b) || (a.proximaParcela ?? '').localeCompare(b.proximaParcela ?? ''))
}
