import type { LinkTarget } from './resource-actions'

/**
 * Conexão guiada: o usuário escolhe o destino de cada produto ANTES de
 * autorizar, quando as contas do banco ainda não existem do lado da Polp. Esta
 * decisão aplica a escolha depois que elas chegam.
 *
 * Só vincula quando não há o que adivinhar — exatamente um recurso livre do
 * tipo. Com zero ou dois ou mais, fica para a tela da conexão: vincular a conta
 * errada mistura dois históricos, e isso é trabalhoso de desfazer.
 */

export type TipoDeRecurso = 'ACCOUNT' | 'CREDIT_CARD_ACCOUNT'

/** Tipos de conta do floow que aceitam cada tipo de recurso (espelha resource-actions). */
export const TIPOS_COMPATIVEIS: Record<TipoDeRecurso, string[]> = {
  ACCOUNT: ['checking', 'savings', 'cash'],
  CREDIT_CARD_ACCOUNT: ['credit_card'],
}

/** As colunas `target_*` de `openfinance_connections`. */
export interface DestinosGuardados {
  targetAccountId: string | null
  targetCardAccountId: string | null
  targetAccountNewName: string | null
  targetCardNewName: string | null
}

export interface RecursoDaConexao {
  id: string
  resourceType: string
  accountId: string | null
}

export interface VinculoDecidido {
  resourceId: string
  resourceType: TipoDeRecurso
  target: LinkTarget
  /** AAAA-MM-DD, ou null para trazer todo o histórico. */
  syncFromDate: string | null
}

export interface DecisaoDeAutoVinculo {
  /** Conexão criada antes da jornada guiada: nada a fazer, fluxo manual. */
  legado: boolean
  vinculos: VinculoDecidido[]
  /** Dois ou mais recursos livres do tipo: o usuário escolhe na tela. */
  ambiguos: TipoDeRecurso[]
  /** O banco não mandou nenhum recurso do tipo escolhido. */
  faltando: TipoDeRecurso[]
}

export function semDestinos(d: DestinosGuardados): boolean {
  return !d.targetAccountId && !d.targetCardAccountId && !d.targetAccountNewName && !d.targetCardNewName
}

function destinoDoTipo(d: DestinosGuardados, tipo: TipoDeRecurso): LinkTarget | null {
  const id = tipo === 'ACCOUNT' ? d.targetAccountId : d.targetCardAccountId
  if (id) return { kind: 'existing', accountId: id }
  const nome = tipo === 'ACCOUNT' ? d.targetAccountNewName : d.targetCardNewName
  if (nome) return { kind: 'new', name: nome }
  return null
}

/** Dia seguinte a AAAA-MM-DD — o mesmo corte que a tela da conexão sugere. */
export function diaSeguinte(data: string): string {
  const dia = new Date(`${data}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + 1)
  return dia.toISOString().slice(0, 10)
}

export function decidirAutoVinculo(
  destinos: DestinosGuardados,
  recursos: RecursoDaConexao[],
  ultimaTransacaoPorConta: Record<string, string>,
): DecisaoDeAutoVinculo {
  const decisao: DecisaoDeAutoVinculo = { legado: false, vinculos: [], ambiguos: [], faltando: [] }
  if (semDestinos(destinos)) return { ...decisao, legado: true }

  for (const tipo of ['ACCOUNT', 'CREDIT_CARD_ACCOUNT'] as const) {
    const target = destinoDoTipo(destinos, tipo)
    if (!target) continue

    const doTipo = recursos.filter((r) => r.resourceType === tipo)
    if (doTipo.length === 0) {
      decisao.faltando.push(tipo)
      continue
    }

    // A conta escolhida já espelha um recurso (o usuário vinculou à mão):
    // a escolha já foi aplicada, não há o que fazer.
    if (target.kind === 'existing' && recursos.some((r) => r.accountId === target.accountId)) continue

    const livres = doTipo.filter((r) => !r.accountId)
    if (livres.length === 0) continue // todos já vinculados: nunca sobrescreve
    if (livres.length > 1) {
      decisao.ambiguos.push(tipo)
      continue
    }

    const ultima = target.kind === 'existing' ? ultimaTransacaoPorConta[target.accountId] : undefined
    decisao.vinculos.push({
      resourceId: livres[0].id,
      resourceType: tipo,
      target,
      syncFromDate: ultima ? diaSeguinte(ultima) : null,
    })
  }

  return decisao
}
