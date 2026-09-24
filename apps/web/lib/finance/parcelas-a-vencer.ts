/**
 * Parcela de cartão que cai no mês e ainda não venceu. Já é certa — o banco
 * cobrou a compra —, mas só vira gasto no vencimento da fatura, quando
 * `applyDueBankTransactions` a aplica. Até lá aparece como "a vencer" na
 * Meta de Gastos, e nunca nos dois lugares.
 */
export interface ParcelaAVencer {
  categoryId: string
  description: string
  installmentNumber: number
  installmentTotal: number
  /** Positivo. */
  amountCents: number
}

export interface ParcelasDaCategoria {
  totalCents: number
  parcelas: ParcelaAVencer[]
}

export function somarParcelasPorCategoria(rows: ParcelaAVencer[]): Record<string, ParcelasDaCategoria> {
  const r: Record<string, ParcelasDaCategoria> = {}
  for (const p of rows) {
    const c = (r[p.categoryId] ??= { totalCents: 0, parcelas: [] })
    c.totalCents += p.amountCents
    c.parcelas.push(p)
  }
  return r
}

/** Quanto ainda cabe na meta: o comprometido com parcelas já não está livre. */
export function livreDaCategoria(plannedCents: number, gastoCents: number, aVencerCents: number): number {
  return plannedCents - gastoCents - aVencerCents
}
