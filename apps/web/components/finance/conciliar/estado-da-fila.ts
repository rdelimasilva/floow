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
  | { tipo: 'regraConfirmada'; counterpartyId: string }
  | { tipo: 'pulado'; id: string }
  | { tipo: 'revisarPulados' }

/** A ordem de decidir dentro do card é a mesma da fila: repetido, vínculo, classificação (spec §2.3). */
export function faseDe(item: ItemDaFila): Fase | null {
  if (item.repetido) return 'repetido'
  if (item.candidatas.length > 0) return 'candidatas'
  if (item.classificacao) return 'classificar'
  return null
}

function atualizar(estado: EstadoDaFila, id: string, mudar: (i: ItemDaFila) => ItemDaFila): EstadoDaFila {
  const itens = estado.itens.map((i) => (i.id === id ? mudar(i) : i))
  const resolvidos = itens.filter((i) => faseDe(i) === null).length
  return { ...estado, itens: itens.filter((i) => faseDe(i) !== null), feitos: estado.feitos + resolvidos }
}

export function reduzir(estado: EstadoDaFila, evento: Evento): EstadoDaFila {
  switch (evento.tipo) {
    case 'resolvido':
      return { ...estado, itens: estado.itens.filter((i) => i.id !== evento.id), feitos: estado.feitos + 1 }
    case 'semRepetido':
      return atualizar(estado, evento.id, (i) => ({ ...i, repetido: null }))
    case 'semVinculo':
      return atualizar(estado, evento.id, (i) => ({ ...i, candidatas: [] }))
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
