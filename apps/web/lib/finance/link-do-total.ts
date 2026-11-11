// Sem imports: client components usam este arquivo, e ele não pode puxar @floow/db.

export interface OpcoesDoLink {
  /** `YYYY-MM-DD`. Sempre os dois: sem `fim`, a lista corta em hoje e some com lançamento realizado de data futura. */
  inicio: string
  fim: string
  categoryIds?: string[]
  accountIds?: string[]
  tipos?: ('income' | 'expense')[]
  caixa?: boolean
  situacao?: 'realizado' | 'previsto'
}

/** Link de Transações que lista os lançamentos de um total. Chaves na ordem de `FILTER_KEYS`. */
export function linkDoTotal(o: OpcoesDoLink): string {
  const q = new URLSearchParams()
  if (o.accountIds?.length) q.set('accountId', o.accountIds.join(','))
  q.set('startDate', o.inicio)
  q.set('endDate', o.fim)
  if (o.tipos?.length) q.set('types', o.tipos.join(','))
  if (o.categoryIds?.length) q.set('categoryIds', o.categoryIds.join(','))
  if (o.caixa) q.set('caixa', '1')
  if (o.situacao) q.set('situacao', o.situacao)
  return `/transactions?${q.toString()}`
}

/** Primeiro e último dia do mês de `mes` (`YYYY-MM` ou `YYYY-MM-DD`). */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [y, m] = mes.split('-').map(Number)
  const dia = (d: Date) => d.toISOString().slice(0, 10)
  return { inicio: dia(new Date(Date.UTC(y, m - 1, 1))), fim: dia(new Date(Date.UTC(y, m, 0))) }
}

/** Mesmos parâmetros dos totais de gasto (Gastos, Ritmo, Dashboard): realizado que conta no caixa. */
export function linkDeGastoDoMes(mes: string, categoryIds: string[]): string {
  return linkDoTotal({
    ...limitesDoMes(mes), categoryIds, tipos: ['expense'], caixa: true, situacao: 'realizado',
  })
}

/**
 * A categoria e as filhas que somam nela. Com `orcadas`, repete o rollup de
 * Gastos/Ritmo (`resolveBudgetedCategory`): filha com meta própria fica de fora.
 */
export function idsComFilhas(
  categoryId: string,
  categorias: { id: string; parentId: string | null }[],
  orcadas?: Iterable<string>,
): string[] {
  const pai = new Map(categorias.map((c) => [c.id, c.parentId]))
  const meta = orcadas ? new Set(orcadas) : null
  // Sobe até a primeira categoria orçada, no máximo 8 níveis e sem laço.
  const destino = (id: string): string => {
    let atual: string | null = id
    const vistos = new Set<string>()
    for (let i = 0; i < 8 && atual !== null && !vistos.has(atual); i++) {
      if (meta!.has(atual)) return atual
      vistos.add(atual)
      atual = pai.get(atual) ?? null
    }
    return id
  }
  const desce = (id: string): boolean => {
    let atual: string | null = pai.get(id) ?? null
    for (let i = 0; i < 8 && atual !== null; i++) {
      if (atual === categoryId) return true
      atual = pai.get(atual) ?? null
    }
    return false
  }
  const filhas = categorias
    .filter((c) => c.id !== categoryId && desce(c.id) && (!meta || destino(c.id) === categoryId))
    .map((c) => c.id)
  return [categoryId, ...filhas]
}

/**
 * Célula do detalhamento do Fluxo de caixa. `situacao` vem da visão (Ambos omite).
 * Sem link com transferências à mostra: a célula as soma pelo sinal e nenhum filtro de Transações reproduz isso.
 */
export function linkDeCelulaDoFluxo(o: {
  inicio: string
  fim: string
  tipo: 'income' | 'expense'
  visao: 'realized' | 'projected' | 'both'
  ocultarTransferencias: boolean
  accountIds?: string[]
}): string | null {
  if (!o.ocultarTransferencias) return null
  const situacao = o.visao === 'realized' ? 'realizado' : o.visao === 'projected' ? 'previsto' : undefined
  return linkDoTotal({
    inicio: o.inicio, fim: o.fim, accountIds: o.accountIds, tipos: [o.tipo], caixa: true, situacao,
  })
}
