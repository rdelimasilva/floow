/**
 * Desconciliar: devolver um lançamento à fila onde a decisão foi tomada.
 *
 * Dois tipos de conciliação existem, cada um com a sua fila:
 * - Classificar: a regra da contraparte deu natureza, categoria ou conta de
 *   destino ao lançamento — e, se transferência, criou a perna na outra conta.
 * - Confirmar previsões: uma previsão foi casada com o realizado que a cumpriu.
 *
 * Previsão vem primeiro: quando as duas coisas valem, o casamento foi a
 * última decisão, e é ela que o usuário vê na linha.
 */
export type FilaDeOrigem = 'classificar' | 'previsoes'

export interface LinhaConciliavel {
  counterpartyId?: string | null
  reviewState?: string | null
  transferGroupId?: string | null
  externalId?: string | null
  /** Preenchido na PREVISÃO cumprida. */
  matchedTransactionId?: string | null
  /** O realizado que alguma previsão aponta. */
  cumprePrevisao?: boolean
}

/** Pernas que a regra cria na conta de destino (ver `transfer-leg.ts`). */
const SUFIXOS_DE_PERNA = [':transfer-dest', ':transfer-par']

export function ehPernaCriadaPelaRegra(externalId: string | null | undefined): boolean {
  return externalId != null && SUFIXOS_DE_PERNA.some((s) => externalId.endsWith(s))
}

export function podeDesconciliar(l: LinhaConciliavel): FilaDeOrigem | null {
  if (l.matchedTransactionId || l.cumprePrevisao) return 'previsoes'
  if (l.counterpartyId && l.reviewState === 'confirmed') return 'classificar'
  if (l.transferGroupId && ehPernaCriadaPelaRegra(l.externalId)) return 'classificar'
  return null
}
