/**
 * Média mensal de gasto por categoria nos meses fechados da janela da sugestão
 * de metas. Mês sem gasto entra como zero: dividir só pelos meses com gasto
 * inflava a média de categoria esporádica.
 */
export function mediaMensalPorCategoria(
  rows: { categoryId: string | null; cents: number }[],
  months: string[],
): { categoryId: string | null; spent: number }[] {
  if (months.length === 0) return []
  const soma = new Map<string | null, number>()
  for (const r of rows) soma.set(r.categoryId, (soma.get(r.categoryId) ?? 0) + r.cents)
  return [...soma].map(([categoryId, total]) => ({ categoryId, spent: Math.round(total / months.length) }))
}
