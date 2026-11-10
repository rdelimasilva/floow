const MESES = 6
const MINIMO = 3

/**
 * Gasto médio dos 6 meses fechados antes do mês de `hoje` (aaaa-MM-dd).
 *
 * A média usa só os meses que têm lançamento. Com menos de 3 meses o gasto
 * fica null: as regras de colchão e dinheiro parado não disparam e o
 * diagnóstico avisa que falta histórico.
 */
export function gastoMensalDosMeses(meses: { month: string; expense: number }[], hoje: string): number | null {
  const ano = Number(hoje.slice(0, 4))
  const mes = Number(hoje.slice(5, 7))
  const janela = new Set<string>()
  for (let i = 1; i <= MESES; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    janela.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const dentro = meses.filter((m) => janela.has(m.month) && m.expense !== 0)
  if (dentro.length < MINIMO) return null
  return Math.round(dentro.reduce((s, m) => s + Math.abs(m.expense), 0) / dentro.length)
}
