/**
 * Recorrente marcada como meta de gasto (`recurring_templates.counts_as_budget`).
 *
 * A meta não é copiada para `budget_entries`: é derivada na leitura, a partir
 * das parcelas do mês. Copiar exigiria manter as duas tabelas em sincronia a
 * cada edição, pausa ou exclusão da recorrente.
 *
 * A frequência sai de graça por contar parcelas geradas: semanal soma quatro
 * ou cinco no mês, anual só aparece no mês do vencimento, recorrente encerrada
 * some sozinha.
 *
 * Regra de piso: a recorrente conta DENTRO da meta manual da categoria. O
 * orçado é o maior entre a meta manual e o comprometido pelas recorrentes —
 * nunca a soma, que contaria o iFood duas vezes dentro de "Alimentação".
 */

/** Uma parcela de recorrente-meta que cai no mês. */
export interface OcorrenciaDeRecorrente {
  templateId: string
  description: string
  categoryId: string
  /** Valor do template, positivo. Não o pago: conta variável compara estimado com real. */
  amountCents: number
}

export interface RecorrenteNaMeta {
  templateId: string
  description: string
  totalCents: number
}

export interface RecorrentesDaCategoria {
  totalCents: number
  recorrentes: RecorrenteNaMeta[]
}

export interface MetaManual {
  id: string
  categoryId: string | null
  plannedCents: number
}

export interface LinhaDeMeta {
  /** Id em `budget_entries`; null quando a linha vem só de recorrentes. */
  entryId: string | null
  categoryId: string | null
  /** O orçado efetivo: max(manual, recorrentes). */
  plannedCents: number
  manualCents: number | null
  recorrentesCents: number
  recorrentes: RecorrenteNaMeta[]
  /** A meta manual ficou abaixo do que as recorrentes já comprometem. */
  abaixoDoPiso: boolean
}

export function somarRecorrentesPorCategoria(
  ocorrencias: OcorrenciaDeRecorrente[],
): Map<string, RecorrentesDaCategoria> {
  const mapa = new Map<string, RecorrentesDaCategoria>()
  for (const o of ocorrencias) {
    const daCategoria = mapa.get(o.categoryId) ?? { totalCents: 0, recorrentes: [] }
    daCategoria.totalCents += o.amountCents
    const existente = daCategoria.recorrentes.find((r) => r.templateId === o.templateId)
    if (existente) existente.totalCents += o.amountCents
    else daCategoria.recorrentes.push({ templateId: o.templateId, description: o.description, totalCents: o.amountCents })
    mapa.set(o.categoryId, daCategoria)
  }
  return mapa
}

export function combinarMetasDoMes(
  manuais: MetaManual[],
  recorrentes: Map<string, RecorrentesDaCategoria>,
): LinhaDeMeta[] {
  const jaAplicadas = new Set<string>()

  const linhas: LinhaDeMeta[] = manuais.map((m) => {
    // O piso entra só na primeira meta manual da categoria; repetir nas
    // demais contaria o mesmo comprometido duas vezes no total.
    const daCategoria = m.categoryId && !jaAplicadas.has(m.categoryId) ? recorrentes.get(m.categoryId) : undefined
    if (m.categoryId && daCategoria) jaAplicadas.add(m.categoryId)
    const recorrentesCents = daCategoria?.totalCents ?? 0
    return {
      entryId: m.id,
      categoryId: m.categoryId,
      plannedCents: Math.max(m.plannedCents, recorrentesCents),
      manualCents: m.plannedCents,
      recorrentesCents,
      recorrentes: daCategoria?.recorrentes ?? [],
      abaixoDoPiso: m.plannedCents < recorrentesCents,
    }
  })

  for (const [categoryId, daCategoria] of recorrentes) {
    if (jaAplicadas.has(categoryId)) continue
    linhas.push({
      entryId: null,
      categoryId,
      plannedCents: daCategoria.totalCents,
      manualCents: null,
      recorrentesCents: daCategoria.totalCents,
      recorrentes: daCategoria.recorrentes,
      abaixoDoPiso: false,
    })
  }

  return linhas
}
