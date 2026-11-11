export interface LancamentoDoFluxo {
  date: Date | string
  amountCents: number
  type: string
  accountId: string
}

export interface MesDoFluxo {
  month: string
  income: number
  expense: number
  net: number
}

/**
 * Receita e despesa por mês a partir dos lançamentos que a tela já carrega,
 * no período e nas contas do recorte. Sai da mesma lista do detalhamento, então
 * o export bate com o que a tela mostra. Transferência fica fora, como no gráfico.
 */
export function resumoMensalDeLancamentos(
  lancamentos: LancamentoDoFluxo[],
  { inicio, fim, contas }: { inicio?: string; fim?: string; contas?: string[] },
): MesDoFluxo[] {
  const meses = new Map<string, MesDoFluxo>()
  for (const l of lancamentos) {
    const dia = (l.date instanceof Date ? l.date.toISOString() : String(l.date)).slice(0, 10)
    if ((inicio && dia < inicio) || (fim && dia > fim)) continue
    if (contas?.length && !contas.includes(l.accountId)) continue
    if (l.type !== 'income' && l.type !== 'expense') continue
    const m = meses.get(dia.slice(0, 7)) ?? { month: dia.slice(0, 7), income: 0, expense: 0, net: 0 }
    m[l.type] += l.amountCents
    m.net = m.income + m.expense
    meses.set(m.month, m)
  }
  return [...meses.values()].sort((a, b) => b.month.localeCompare(a.month))
}
