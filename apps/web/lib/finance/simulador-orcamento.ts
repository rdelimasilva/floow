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

export interface LinhaParaAplicar {
  categoryId: string
  simuladoCents: number
  /** O orçado efetivo do mês no plano (0 quando a categoria entrou na simulação). */
  vigenteCents: number
  /** Meta manual que vale no mês; null quando a linha vem só de recorrentes ou é nova. */
  entrada: { id: string; startMonth: string; endMonth: string | null } | null
}

export type Operacao =
  | { tipo: 'atualizar'; id: string; plannedCents: number }
  | { tipo: 'encerrar'; id: string; endMonth: string }
  | { tipo: 'apagar'; id: string }
  | { tipo: 'criar'; categoryId: string; plannedCents: number; startMonth: string; endMonth: string | null }

function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * O que gravar para a simulação valer de `mes` (YYYY-MM-01) em diante. Meta que
 * começou antes é encerrada no mês anterior e ganha uma sucessora: mudar o valor
 * dela reescreveria o orçado dos meses que já passaram.
 */
export function planejarAplicacao(linhas: LinhaParaAplicar[], mes: string): Operacao[] {
  const ops: Operacao[] = []
  for (const l of linhas) {
    if (l.simuladoCents === l.vigenteCents) continue
    const e = l.entrada
    if (!e) {
      // Sem meta manual, zerar não tem o que desfazer: o piso é das recorrentes
      if (l.simuladoCents > 0)
        ops.push({ tipo: 'criar', categoryId: l.categoryId, plannedCents: l.simuladoCents, startMonth: mes, endMonth: null })
      continue
    }
    const comecouAntes = e.startMonth < mes
    if (l.simuladoCents === 0) {
      ops.push(comecouAntes ? { tipo: 'encerrar', id: e.id, endMonth: mesAnterior(mes) } : { tipo: 'apagar', id: e.id })
    } else if (comecouAntes) {
      ops.push({ tipo: 'encerrar', id: e.id, endMonth: mesAnterior(mes) })
      ops.push({ tipo: 'criar', categoryId: l.categoryId, plannedCents: l.simuladoCents, startMonth: mes, endMonth: e.endMonth })
    } else {
      ops.push({ tipo: 'atualizar', id: e.id, plannedCents: l.simuladoCents })
    }
  }
  return ops
}
