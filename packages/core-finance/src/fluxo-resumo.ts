/**
 * Resumo em linguagem simples do último mês fechado do fluxo de caixa:
 * quanto sobrou, quanto isso difere da média dos meses anteriores e o que
 * explica a diferença.
 */

export interface MesDoFluxo {
  /** YYYY-MM */
  month: string
  income: number
  /** Convenção do floow: despesa é negativa. */
  expense: number
}

export interface GastoDaCategoria {
  month: string
  categoria: string
  /** Positivo: quanto saiu na categoria no mês. */
  cents: number
}

export interface CategoriaDoMes {
  categoria: string
  cents: number
  media: number
  /** cents - media: positivo é gasto acima do normal. */
  variacao: number
}

export interface ResumoDoFluxo {
  mes: string
  receita: number
  despesa: number
  sobra: number
  /** null quando não há mês anterior com movimento para comparar. */
  mediaSobra: number | null
  mesesNaMedia: number
  /** As maiores categorias do mês, da maior para a menor. */
  categorias: CategoriaDoMes[]
  /** Até duas causas da diferença para a média, na direção dela. "Receitas" é uma delas. */
  explicam: { item: string; impacto: number }[]
}

export function mesAnterior(mes: string, n = 1): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return d.toISOString().slice(0, 7)
}

const media = (valores: number[]) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0)

export function resumirFluxo(
  meses: MesDoFluxo[],
  gastos: GastoDaCategoria[],
  mesAtual: string,
  janela = 6,
  topCategorias = 5,
): ResumoDoFluxo | null {
  const mes = mesAnterior(mesAtual)
  const doMes = meses.find((m) => m.month === mes)
  if (!doMes) return null

  const historicoMeses = new Set(Array.from({ length: janela }, (_, i) => mesAnterior(mes, i + 1)))
  // Mês sem movimento fica de fora: costuma ser antes de a pessoa usar o app.
  const historico = meses.filter((m) => historicoMeses.has(m.month))
  const n = historico.length

  const sobra = doMes.income + doMes.expense
  const mediaSobra = n ? media(historico.map((m) => m.income + m.expense)) : null

  const porCategoria = new Map<string, { mes: number; historico: number }>()
  for (const g of gastos) {
    const noMes = g.month === mes
    if (!noMes && !historicoMeses.has(g.month)) continue
    const atual = porCategoria.get(g.categoria) ?? { mes: 0, historico: 0 }
    if (noMes) atual.mes += g.cents
    else atual.historico += g.cents
    porCategoria.set(g.categoria, atual)
  }

  const todas: CategoriaDoMes[] = [...porCategoria].map(([categoria, v]) => {
    const m = n ? v.historico / n : 0
    return { categoria, cents: v.mes, media: m, variacao: v.mes - m }
  })

  const categorias = todas
    .filter((c) => c.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, topCategorias)

  let explicam: ResumoDoFluxo['explicam'] = []
  if (mediaSobra !== null && sobra !== mediaSobra) {
    const piorou = sobra < mediaSobra
    const candidatos = [
      { item: 'Receitas', impacto: doMes.income - media(historico.map((m) => m.income)) },
      // Gasto acima da média reduz a sobra: o impacto tem o sinal oposto.
      ...todas.map((c) => ({ item: c.categoria, impacto: -c.variacao })),
    ]
    explicam = candidatos
      .filter((c) => (piorou ? c.impacto < 0 : c.impacto > 0))
      .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))
      .slice(0, 2)
  }

  return {
    mes,
    receita: doMes.income,
    despesa: -doMes.expense,
    sobra,
    mediaSobra,
    mesesNaMedia: n,
    categorias,
    explicam,
  }
}
