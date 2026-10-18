/**
 * Alertas de meta de aporte do Dashboard.
 *
 * As metas vêm de `budget_entries` (tipo `investing`), a mesma fonte da tela
 * Meta de Investimentos — não de `budget_goals`, tabela antiga que nenhuma
 * tela cria nem edita mais. O aportado é dividido entre as metas na proporção
 * do planejado, como a tela faz.
 */

export interface AlertaDeAporte {
  name: string
  currentCents: number
  limitCents: number
  href: string
}

export function alertasDeAporte(
  metas: { name: string | null; plannedCents: number }[],
  aportadoCents: number,
  inicio: Date,
  fim: Date,
  agora: Date,
): AlertaDeAporte[] {
  const totalPlanejado = metas.reduce((sum, m) => sum + m.plannedCents, 0)
  if (totalPlanejado <= 0) return []

  const DIA = 1000 * 60 * 60 * 24
  const totalDias = Math.max(1, (fim.getTime() - inicio.getTime()) / DIA)
  const diasPassados = Math.max(1, (agora.getTime() - inicio.getTime()) / DIA)
  const esperadoPct = (diasPassados / totalDias) * 100

  const alertas: AlertaDeAporte[] = []
  for (const meta of metas) {
    if (meta.plannedCents <= 0) continue
    const aportado = metas.length === 1
      ? aportadoCents
      : Math.round(aportadoCents * (meta.plannedCents / totalPlanejado))
    const realPct = (aportado / meta.plannedCents) * 100
    if (realPct < esperadoPct * 0.8) {
      alertas.push({
        name: meta.name ?? 'Aportes',
        currentCents: aportado,
        limitCents: meta.plannedCents,
        href: '/budgets/investing',
      })
    }
  }
  return alertas
}
