// Quantas vezes cada frequência acontece por mês, na média do ano.
const OCORRENCIAS_POR_MES: Record<string, number> = {
  daily: 365 / 12,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
}

interface RecorrenteParaTotal {
  type: 'income' | 'expense' | 'transfer'
  amountCents: number
  frequency: string
  isActive: boolean
}

export interface TotalMensalRecorrentes {
  receitasCents: number
  despesasCents: number
  saldoCents: number
  quantidade: number
}

/** Soma das recorrências ativas convertida para o equivalente de um mês. */
export function totalMensalRecorrentes(templates: RecorrenteParaTotal[]): TotalMensalRecorrentes {
  let receitas = 0
  let despesas = 0
  let quantidade = 0
  for (const t of templates) {
    if (!t.isActive || t.type === 'transfer') continue
    const valor = t.amountCents * (OCORRENCIAS_POR_MES[t.frequency] ?? 1)
    if (t.type === 'income') receitas += valor
    else despesas += valor
    quantidade++
  }
  const receitasCents = Math.round(receitas)
  const despesasCents = Math.round(despesas)
  return { receitasCents, despesasCents, saldoCents: receitasCents - despesasCents, quantidade }
}
