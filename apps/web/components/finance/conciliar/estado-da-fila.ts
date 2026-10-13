import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'

export type Fase = 'repetido' | 'decidir'

export interface EstadoDaFila {
  itens: ItemDaFila[]
  feitos: number
}

export type Evento =
  | { tipo: 'resolvido'; id: string }
  | { tipo: 'semRepetido'; id: string }
  | { tipo: 'semVinculo'; id: string }
  /** `classificou`: a previsão trazia categoria e o servidor a passou ao lançamento. */
  | { tipo: 'vinculado'; id: string; previsaoId: string; classificou: boolean }
  /** O servidor recusou o par (a previsão deixou de valer): sai só aquela candidata. */
  | { tipo: 'candidataRecusada'; id: string; previsaoId: string }
  | { tipo: 'regraConfirmada'; counterpartyId: string }

/**
 * O repetido decide primeiro (spec §2.3); depois vínculo e classificação.
 * Sem nada a decidir, o item sai da fila.
 */
export function faseDe(item: ItemDaFila): Fase | null {
  if (item.repetido) return 'repetido'
  if (item.candidatas.length > 0 || item.classificacao) return 'decidir'
  return null
}

/** Aplica `mudar` a todos os itens; quem fica sem nada a decidir sai e conta como feito. */
function atualizarTodos(estado: EstadoDaFila, mudar: (i: ItemDaFila) => ItemDaFila): EstadoDaFila {
  const mudados = estado.itens.map(mudar)
  const itens = mudados.filter((i) => faseDe(i) !== null)
  return { ...estado, itens, feitos: estado.feitos + mudados.length - itens.length }
}

function atualizar(estado: EstadoDaFila, id: string, mudar: (i: ItemDaFila) => ItemDaFila): EstadoDaFila {
  return atualizarTodos(estado, (i) => (i.id === id ? mudar(i) : i))
}

export function reduzir(estado: EstadoDaFila, evento: Evento): EstadoDaFila {
  switch (evento.tipo) {
    case 'resolvido':
      return { ...estado, itens: estado.itens.filter((i) => i.id !== evento.id), feitos: estado.feitos + 1 }
    case 'semRepetido':
      return atualizar(estado, evento.id, (i) => ({ ...i, repetido: null }))
    case 'semVinculo':
      return atualizar(estado, evento.id, (i) => ({ ...i, candidatas: [] }))
    case 'vinculado':
      // Uma previsão só cumpre um lançamento: some da lista de todos os outros.
      return atualizarTodos(estado, (i) => (i.id === evento.id
        ? { ...i, candidatas: [], classificacao: evento.classificou ? null : i.classificacao }
        : { ...i, candidatas: i.candidatas.filter((c) => c.id !== evento.previsaoId) }))
    case 'candidataRecusada':
      return atualizar(estado, evento.id, (i) => ({ ...i, candidatas: i.candidatas.filter((c) => c.id !== evento.previsaoId) }))
    case 'regraConfirmada': {
      let e = estado
      for (const i of estado.itens) {
        if (i.classificacao?.counterpartyId === evento.counterpartyId) e = atualizar(e, i.id, (x) => ({ ...x, classificacao: null }))
      }
      return e
    }
  }
}

