import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'

export type Fase = 'repetido' | 'candidatas' | 'classificar'

export interface EstadoDaFila {
  itens: ItemDaFila[]
  pulados: string[]
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
  /** Próximo lote pedido quando só restavam pulados: entra na frente deles. */
  | { tipo: 'loteAnexado'; itens: ItemDaFila[] }
  | { tipo: 'pulado'; id: string }
  | { tipo: 'revisarPulados' }

/** A ordem de decidir dentro do card é a mesma da fila: repetido, vínculo, classificação (spec §2.3). */
export function faseDe(item: ItemDaFila): Fase | null {
  if (item.repetido) return 'repetido'
  if (item.candidatas.length > 0) return 'candidatas'
  if (item.classificacao) return 'classificar'
  return null
}

/** Aplica `mudar` a todos os itens; quem fica sem nada a decidir sai e conta como feito. */
function atualizarTodos(estado: EstadoDaFila, mudar: (i: ItemDaFila) => ItemDaFila): EstadoDaFila {
  const mudados = estado.itens.map(mudar)
  const itens = mudados.filter((i) => faseDe(i) !== null)
  // Um pulado pode sair por decisão tomada em outro card: não pode seguir contado.
  const pulados = estado.pulados.filter((id) => itens.some((i) => i.id === id))
  return { ...estado, itens, pulados, feitos: estado.feitos + mudados.length - itens.length }
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
    case 'loteAnexado': {
      const presentes = new Set(estado.itens.map((i) => i.id))
      const novos = evento.itens.filter((i) => !presentes.has(i.id) && faseDe(i) !== null)
      return { ...estado, itens: [...novos, ...estado.itens] }
    }
    case 'regraConfirmada': {
      let e = estado
      for (const i of estado.itens) {
        if (i.classificacao?.counterpartyId === evento.counterpartyId) e = atualizar(e, i.id, (x) => ({ ...x, classificacao: null }))
      }
      return e
    }
    case 'pulado': {
      const item = estado.itens.find((i) => i.id === evento.id)
      if (!item) return estado
      return {
        ...estado,
        itens: [...estado.itens.filter((i) => i.id !== evento.id), item],
        pulados: estado.pulados.includes(evento.id) ? estado.pulados : [...estado.pulados, evento.id],
      }
    }
    case 'revisarPulados':
      return { ...estado, pulados: [] }
  }
}

export function soRestamPulados(estado: EstadoDaFila): boolean {
  return estado.itens.length > 0 && estado.itens.every((i) => estado.pulados.includes(i.id))
}
