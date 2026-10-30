import { lancamentosDasFaturas, type LancamentoDaFatura } from './fatura'

export interface LancamentoComCategoria extends LancamentoDaFatura {
  categoryName: string | null
}

export interface GastoDaFatura<T extends LancamentoComCategoria = LancamentoComCategoria> {
  fechamento: string
  /** Compras menos estornos, positivo. */
  totalCents: number
  porCategoria: Map<string, number>
  /** Os lançamentos que entraram na soma. */
  lancamentos: T[]
}

export const SEM_CATEGORIA = 'Sem categoria'

/**
 * Quanto se gastou em cada fatura, por categoria, em ordem de fechamento.
 *
 * Só compras e estornos, pela mesma regra do total da fatura: o saldo que
 * sobrou da fatura anterior e o pagamento não são gasto do mês.
 */
export function gastosPorFatura<T extends LancamentoComCategoria>(
  lancamentos: readonly T[],
  closingDay: number,
  dueDay: number | null,
  hoje: string | null,
): GastoDaFatura<T>[] {
  const { entram, fechamentos } = lancamentosDasFaturas(lancamentos, closingDay, dueDay, hoje)
  const porFatura = new Map<string, GastoDaFatura<T>>()
  entram.forEach((l, i) => {
    const f = fechamentos[i]
    const g = porFatura.get(f) ?? { fechamento: f, totalCents: 0, porCategoria: new Map<string, number>(), lancamentos: [] as T[] }
    const cat = l.categoryName ?? SEM_CATEGORIA
    g.totalCents -= l.amountCents
    g.porCategoria.set(cat, (g.porCategoria.get(cat) ?? 0) - l.amountCents)
    g.lancamentos.push(l)
    porFatura.set(f, g)
  })
  return [...porFatura.values()].sort((a, b) => a.fechamento.localeCompare(b.fechamento))
}
