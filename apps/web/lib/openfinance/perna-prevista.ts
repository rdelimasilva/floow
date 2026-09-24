import { sql, type SQL } from 'drizzle-orm'
import { transactions } from '@floow/db'

/**
 * Perna de transferência criada como PREVISÃO: o destino é conta Open Finance,
 * então o dinheiro de verdade chega pelo extrato daquela conta. A perna só
 * marca que ele é esperado — `balance_applied = false` para sempre — até a
 * conciliação (`criarPropostasDeConciliacao`) casá-la com a ponta real.
 *
 * O sufixo distingue esta perna da `:transfer-dest` (destino manual), que
 * também pode nascer com `balance_applied = false` quando a origem é agendada
 * e, essa sim, precisa entrar no saldo quando a data chegar.
 *
 * Ver docs/superpowers/specs/2026-09-24-transferencia-sempre-com-par-design.md §3.1
 */
export const SUFIXO_PERNA_PREVISTA = ':transfer-par'

export function ehPernaPrevista(externalId: string | null | undefined): boolean {
  return Boolean(externalId?.endsWith(SUFIXO_PERNA_PREVISTA))
}

export function condicaoDePernaPrevista(): SQL {
  return sql`${transactions.externalId} like ${`%${SUFIXO_PERNA_PREVISTA}`}`
}

export function condicaoNaoEPernaPrevista(): SQL {
  return sql`(${transactions.externalId} is null or ${transactions.externalId} not like ${`%${SUFIXO_PERNA_PREVISTA}`})`
}
