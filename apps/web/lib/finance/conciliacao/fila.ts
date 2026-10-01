import type { Candidata } from '@/lib/finance/conciliacao/candidatos'
import type { DuplicataPendente } from '@/lib/finance/duplicata-queries'
import type { PendingGroup } from '@/lib/openfinance/counterparty-queries'

export const LOTE_DA_FILA = 50
export const JANELA_FILA_DIAS = 90

export interface ContaDoItem {
  id: string
  nome: string
  tipo: string
  instituicao: string | null
  agencia: string | null
  numero: string | null
}

export interface Repetido {
  propostaId: string
  outro: { id: string; date: string; description: string; amountCents: number }
  horasEntreEmissoes: number
}

export interface Classificacao {
  counterpartyId: string
  displayName: string
  nature: 'income' | 'expense' | 'transfer'
  categoryId: string | null
  suggestionSource: 'historico' | 'claude' | null
  sugestaoContaId: string | null
  ehCpfProprio: boolean
  outrosNaFila: number
}

export interface ItemDaFila {
  id: string
  date: string
  description: string
  amountCents: number
  cardLastDigits: string | null
  importedAt: string | null
  conta: ContaDoItem
  candidatas: Candidata[]
  repetido: Repetido | null
  classificacao: Classificacao | null
}

export interface LancamentoBase extends Omit<ItemDaFila, 'candidatas' | 'repetido' | 'classificacao'> {
  vinculoRevisado: boolean
}

type Parametros = {
  lancamentos: Map<string, LancamentoBase>
  candidatas: Map<string, Candidata[]>
  duplicatas: DuplicataPendente[]
  grupos: PendingGroup[]
}

/**
 * Quem entra na fila e em que ordem (spec 2026-10-01 §3). Pura; a leitura
 * mora em `fila-db.ts`. Um item por lançamento do banco, com tudo que se
 * decide sobre ele: repetido, candidatas e classificação.
 */
export function montarFila({ lancamentos, candidatas, duplicatas, grupos }: Parametros): ItemDaFila[] {
  const repetidos = new Map(duplicatas.map((d) => [d.duplicata.id, {
    propostaId: d.id, outro: d.manter, horasEntreEmissoes: d.horasEntreEmissoes,
  }]))
  const classificacoes = new Map<string, Classificacao>()
  for (const g of grupos) {
    for (const item of g.items) {
      classificacoes.set(item.id, {
        counterpartyId: g.counterpartyId, displayName: g.displayName,
        nature: item.type ?? 'expense',
        categoryId: item.type === 'transfer' ? null : g.suggestedCategoryId ?? null,
        suggestionSource: g.suggestionSource ?? null,
        sugestaoContaId: item.sugestaoContaId, ehCpfProprio: g.ehCpfProprio,
        outrosNaFila: g.items.length - 1,
      })
    }
  }

  const fila: ItemDaFila[] = []
  for (const [id, { vinculoRevisado, ...l }] of lancamentos) {
    const doItem = vinculoRevisado ? [] : candidatas.get(id) ?? []
    const repetido = repetidos.get(id) ?? null
    const classificacao = classificacoes.get(id) ?? null
    if (!repetido && !classificacao && doItem.length === 0) continue
    fila.push({ ...l, candidatas: doItem, repetido, classificacao })
  }
  return fila.sort(
    (a, b) => Number(!!b.repetido) - Number(!!a.repetido) || Math.abs(b.amountCents) - Math.abs(a.amountCents),
  )
}
