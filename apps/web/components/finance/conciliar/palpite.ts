import type { ItemDaFila } from '@/lib/finance/conciliacao/fila'
import type { AccountOption, CategoryOption, Decisao } from './card-classificar'
import { decisaoCompleta } from './card-classificar'
import { diaMes } from './card-conta'
import { faseDe } from './estado-da-fila'

export type Acao = 'descartar' | 'vincular' | 'lancar' | 'escolher'

export interface Palpite {
  acao: Acao
  /** O que o floow acha, numa frase curta. */
  frase: string
  botao: string
  /** Entra no "Confirmar marcados": só quando o botão resolve sem perguntar nada. */
  marcavel: boolean
}

/** "19/09" no fuso do usuário: `importadoEm` é instante, não data. */
export function diaDaChegada(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

/**
 * O palpite da linha (spec 2026-10-13 §2.1), na ordem de `faseDe`: o repetido
 * primeiro, depois a melhor previsão, depois a categoria. O botão faz o que o
 * Enter fazia no card do modo foco.
 */
export function palpiteDe(
  item: ItemDaFila,
  decisao: Decisao | null,
  categoryOptions: CategoryOption[],
  accountOptions: AccountOption[],
): Palpite | null {
  const fase = faseDe(item)
  if (fase === null) return null

  if (fase === 'repetido' && item.repetido) {
    return { acao: 'descartar', frase: `Cópia, chegou de novo em ${diaDaChegada(item.repetido.este.importadoEm)}`, botao: 'Descartar', marcavel: true }
  }

  const melhor = item.candidatas[0]
  if (melhor) {
    return { acao: 'vincular', frase: `É "${melhor.description}" de ${diaMes(melhor.date)}?`, botao: 'Vincular', marcavel: true }
  }

  if (decisao && decisaoCompleta(decisao, item.conta.id)) {
    const frase = decisao.nature === 'transfer'
      ? `Transferência · ${accountOptions.find((a) => a.id === decisao.transferAccountId)?.name ?? 'outra conta'}`
      : categoryOptions.find((o) => o.id === decisao.categoryId)?.label ?? 'Categoria sugerida'
    return { acao: 'lancar', frase, botao: 'Confirmar', marcavel: true }
  }

  return { acao: 'escolher', frase: 'Escolher categoria', botao: 'Escolher', marcavel: false }
}
