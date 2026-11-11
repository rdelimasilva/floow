import { eq, inArray } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * As contas marcadas no filtro, em lista.
 *
 * O parâmetro carrega uma ou várias (`conta-1,conta-2`); vazio significa
 * "todas", que é a ausência de condição e não uma lista vazia no SQL.
 */
export function contasDoFiltro(opts?: { accountId?: string }): string[] {
  if (!opts?.accountId) return []
  return [...new Set(opts.accountId.split(',').filter(Boolean))]
}

/** Uma conta vira igualdade; várias, um `IN`. */
export function condicaoDeConta(coluna: AnyPgColumn, contas: string[]) {
  return contas.length === 1 ? eq(coluna, contas[0]) : inArray(coluna, contas)
}

/**
 * Finais de cartão do filtro, só os de quatro dígitos: o valor vem da URL e
 * vai para um IN, então o que não tiver a forma de um final fica de fora.
 */
export function finaisDoFiltro(opts?: { cardDigits?: string }): string[] {
  if (!opts?.cardDigits) return []
  return [...new Set(opts.cardDigits.split(',').filter((f) => /^\d{4}$/.test(f)))]
}

