/** Quantos dias à frente a seção "Próximas a vencer" olha. */
export const JANELA_PROXIMAS_DIAS = 30

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/**
 * As recorrências ativas cuja próxima parcela em aberto (`proximaParcela`, de
 * `getDatasDasParcelas`) cai entre hoje e os próximos 30 dias, pela data.
 *
 * Não usa `next_due_date`: como as parcelas nascem todas na criação, ele
 * aponta para um período depois da última — em 2031 numa série sem fim — e a
 * seção dizia "nenhuma pendente" com parcelas vencendo na semana.
 */
export function proximasAVencer<T extends { isActive: boolean; proximaParcela?: string | null }>(
  templates: T[],
  hoje: string,
  dias: number = JANELA_PROXIMAS_DIAS,
): (T & { proximaParcela: string })[] {
  const limite = somarDias(hoje, dias)
  return templates
    .filter((t): t is T & { proximaParcela: string } =>
      t.isActive && !!t.proximaParcela && t.proximaParcela >= hoje && t.proximaParcela <= limite)
    .sort((a, b) => a.proximaParcela.localeCompare(b.proximaParcela))
}
